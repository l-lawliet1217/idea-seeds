import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { serpConfigError } from "@/lib/serp";
import { searchGbizByName } from "@/lib/gbizinfo";
import { researchSegment, loadExistingCompanyKeys } from "@/lib/research";
import { enrichOneCompany } from "@/lib/enrich";
import { researchKeymanForCompany } from "@/lib/keyman";
import { JobKind, JobMode, ALL_PHASES, fetchPendingUnits, countPendingUnits } from "@/lib/jobs";

export const maxDuration = 300;

// この時間を超えたら一旦終了し、再キック/次のCronで継続。
// maxDuration(300s)に対し、1バッチ(並列の最遅~90s)が予算境界で始まっても
// 超過しないよう十分な余裕を残す(180+90=270 < 300)。
const BUDGET_MS = 180_000;
const STALE_MS = 180_000; // 実行中ジョブのheartbeatがこれより古ければ別ワーカーが引き取る
const CONCURRENCY: Record<JobKind, number> = { research: 5, enrich: 2, keyman: 3 };

type Job = {
  id: string;
  kind: JobMode;
  phase: string | null;
  business_model_id: string | null;
  database_id: string | null;
  max_segments: number;
  total: number;
  processed: number;
  inserted: number;
  failed: number;
  cost_usd: number;
};

type Dedup = { domains: Set<string>; names: Set<string> } | null;

// Vercel Cron(毎分)またはジョブ作成時のキックから呼ばれる。CRON_SECRETで保護。
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - STALE_MS).toISOString();

  const { data: candidate } = await supabase
    .from("research_jobs")
    .select("*")
    .in("status", ["queued", "running"])
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!candidate) return NextResponse.json({ idle: true });

  // 原子的にロック取得: queued、または heartbeat が古い running のみ claim できる
  const { data: claimed } = await supabase
    .from("research_jobs")
    .update({ status: "running", heartbeat_at: now, updated_at: now })
    .eq("id", candidate.id)
    .or(`status.eq.queued,heartbeat_at.lt.${staleBefore}`)
    .select()
    .maybeSingle();
  if (!claimed) return NextResponse.json({ busy: true });

  const job = claimed as Job;
  const isAll = job.kind === "all";
  const phases: JobKind[] = isAll ? ALL_PHASES : [job.kind as JobKind];
  const filter = {
    business_model_id: job.business_model_id,
    database_id: job.database_id,
  };

  const start = Date.now();
  let processed = job.processed; // 現フェーズの処理数
  let phaseCap = job.total; // 現フェーズの上限
  let inserted = job.inserted; // 全フェーズ累計
  let failed = job.failed;
  let cost = job.cost_usd;

  let phaseIdx = isAll ? Math.max(0, ALL_PHASES.indexOf((job.phase as JobKind) ?? "research")) : 0;
  let dedup: Dedup = null;
  let gbizChecked = false;

  const advancePhase = async () => {
    phaseIdx++;
    if (isAll && phaseIdx < phases.length) {
      processed = 0;
      const pending = await countPendingUnits(supabase, phases[phaseIdx], filter);
      phaseCap = Math.min(pending, job.max_segments);
      await supabase
        .from("research_jobs")
        .update({
          phase: phases[phaseIdx],
          processed: 0,
          total: phaseCap,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    }
  };

  while (Date.now() - start < BUDGET_MS && phaseIdx < phases.length) {
    const phaseKind = phases[phaseIdx];

    // フェーズ別の事前チェック
    if (phaseKind === "enrich") {
      if (!gbizChecked) {
        try {
          await searchGbizByName("トヨタ自動車");
          gbizChecked = true;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await failJob(supabase, job.id, `gBizINFOへの接続に失敗: ${message}`);
          return NextResponse.json({ error: message }, { status: 503 });
        }
      }
    } else {
      const serpConfigErr = serpConfigError();
      if (serpConfigErr) {
        await failJob(supabase, job.id, serpConfigErr);
        return NextResponse.json({ error: serpConfigErr }, { status: 503 });
      }
      if (phaseKind === "research" && !dedup) {
        dedup = await loadExistingCompanyKeys(supabase);
      }
    }

    // キャンセル確認
    const { data: state } = await supabase
      .from("research_jobs")
      .select("status")
      .eq("id", job.id)
      .single();
    if (state?.status === "canceled") {
      return NextResponse.json({ canceled: true });
    }

    if (processed >= phaseCap) {
      await advancePhase();
      continue;
    }

    const batchSize = Math.min(CONCURRENCY[phaseKind], phaseCap - processed);
    const units = await fetchPendingUnits(supabase, phaseKind, filter, batchSize);
    if (units.length === 0) {
      await advancePhase();
      continue;
    }

    const results = await Promise.all(
      units.map((unit) => processUnit(supabase, phaseKind, unit, dedup))
    );
    for (const x of results) {
      processed++;
      inserted += x.inserted;
      cost += x.cost;
      if (!x.ok) failed++;
    }

    await supabase
      .from("research_jobs")
      .update({
        processed,
        total: phaseCap,
        inserted,
        failed,
        cost_usd: cost,
        phase: isAll ? phaseKind : job.phase,
        heartbeat_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
  }

  const done = phaseIdx >= phases.length;
  const finishedAt = new Date().toISOString();
  // 未完了ならロックを解放(status=queued)して、再キック/次のCronが即継続できるようにする
  await supabase
    .from("research_jobs")
    .update({
      status: done ? "done" : "queued",
      phase: isAll ? (done ? "done" : phases[Math.min(phaseIdx, phases.length - 1)]) : job.phase,
      processed,
      total: phaseCap,
      inserted,
      failed,
      cost_usd: cost,
      heartbeat_at: finishedAt,
      updated_at: finishedAt,
    })
    .eq("id", job.id);

  if (!done) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3000);
    try {
      const origin = new URL(req.url).origin;
      await fetch(`${origin}/api/cron/research`, {
        headers: secret ? { authorization: `Bearer ${secret}` } : {},
        signal: controller.signal,
      });
    } catch {
      // abort/失敗は無視
    } finally {
      clearTimeout(t);
    }
  }

  return NextResponse.json({ job_id: job.id, kind: job.kind, inserted, failed, done });
}

// 1単位を処理する。done系フラグを必ず立てて再試行ループを防ぐ。
async function processUnit(
  supabase: SupabaseClient,
  kind: JobKind,
  unit: Record<string, unknown>,
  dedup: Dedup
): Promise<{ ok: boolean; inserted: number; cost: number }> {
  const id = unit.id as string;
  try {
    if (kind === "research") {
      const r = await researchSegment(
        supabase,
        { id, name: unit.name as string },
        dedup ?? undefined
      );
      return { ok: true, inserted: r.inserted, cost: r.cost_usd };
    }
    if (kind === "enrich") {
      const r = await enrichOneCompany(supabase, {
        id,
        name: unit.name as string,
        corporate_number: (unit.corporate_number as string | null) ?? null,
      });
      await supabase.from("companies").update({ enrich_done: true }).eq("id", id);
      return { ok: true, inserted: r.updated ? 1 : 0, cost: 0 };
    }
    const r = await researchKeymanForCompany(supabase, {
      id,
      name: unit.name as string,
      service_name: (unit.service_name as string | null) ?? null,
      service_url: (unit.service_url as string | null) ?? null,
      website_url: (unit.website_url as string | null) ?? null,
      phone: (unit.phone as string | null) ?? null,
    });
    return {
      ok: true,
      inserted: r.contacts_inserted + r.relations_inserted,
      cost: r.cost_usd,
    };
  } catch {
    if (kind === "enrich") {
      await supabase.from("companies").update({ enrich_done: true }).eq("id", id);
    } else if (kind === "keyman") {
      await supabase.from("companies").update({ keyman_research_done: true }).eq("id", id);
    } else {
      await supabase.from("segments").update({ research_done: true }).eq("id", id);
    }
    return { ok: false, inserted: 0, cost: 0 };
  }
}

async function failJob(supabase: SupabaseClient, id: string, message: string) {
  await supabase
    .from("research_jobs")
    .update({ status: "error", error: message, updated_at: new Date().toISOString() })
    .eq("id", id);
}
