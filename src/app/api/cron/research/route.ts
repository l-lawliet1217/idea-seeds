import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { serpConfigError } from "@/lib/serp";
import { searchGbizByName } from "@/lib/gbizinfo";
import { researchSegment, loadExistingCompanyKeys, recheckCompany } from "@/lib/research";
import { enrichOneCompany } from "@/lib/enrich";
import { researchKeymanForCompany } from "@/lib/keyman";
import { JobKind, JobMode, ALL_PHASES, USD_JPY, fetchPendingUnits, countPendingUnits } from "@/lib/jobs";
import { getPipelineSettings, todaySpendUsd } from "@/lib/pipeline";

export const maxDuration = 300;

// この時間を超えたら一旦終了し、再キック/次のCronで継続。
// maxDuration(300s)に対し、1バッチ(並列の最遅~90s)が予算境界で始まっても
// 超過しないよう十分な余裕を残す(180+90=270 < 300)。
const BUDGET_MS = 180_000;
const STALE_MS = 180_000; // 実行中ジョブのheartbeatがこれより古ければ別ワーカーが引き取る
const CONCURRENCY: Record<JobKind, number> = {
  research: 5,
  enrich: 2,
  keyman: 3,
  recheck: 5,
};

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
  // 手動の範囲指定ジョブが無ければ、常駐パイプライン(自動収集)を回す
  if (!candidate) return runStandingPipeline(req, supabase, secret);

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
    if (kind === "recheck") {
      const seg = unit.segments as { name?: string } | null;
      const r = await recheckCompany(supabase, {
        id,
        name: unit.name as string,
        service_name: (unit.service_name as string | null) ?? null,
        service_url: (unit.service_url as string | null) ?? null,
        website_url: (unit.website_url as string | null) ?? null,
        segment_name: seg?.name ?? null,
      });
      return { ok: true, inserted: r.excluded ? 1 : 0, cost: r.cost };
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
    } else if (kind === "recheck") {
      await supabase.from("companies").update({ relevance_checked: true }).eq("id", id);
    } else {
      await supabase.from("segments").update({ research_done: true }).eq("id", id);
    }
    return { ok: false, inserted: 0, cost: 0 };
  }
}

// 常駐パイプライン: 自動収集ONかつ予算内なら、未処理を①→②→(承認時③)へ自動で進める。
// 多重起動は pipeline_settings.locked_until で防ぐ(手動ジョブのような専用テーブルは持たない)。
async function runStandingPipeline(
  req: Request,
  supabase: SupabaseClient,
  secret: string | undefined
) {
  const settings = await getPipelineSettings(supabase);
  if (!settings.enabled) return NextResponse.json({ idle: true });

  // ロック取得(他ワーカーが実行中ならスキップ)
  const lockUntil = new Date(Date.now() + BUDGET_MS + 30_000).toISOString();
  const nowIso = new Date().toISOString();
  const { data: locked } = await supabase
    .from("pipeline_settings")
    .update({ locked_until: lockUntil })
    .eq("id", 1)
    .or(`locked_until.is.null,locked_until.lt.${nowIso}`)
    .select("id")
    .maybeSingle();
  if (!locked) return NextResponse.json({ busy: true });

  try {
    const budgetUsd =
      settings.daily_budget_jpy > 0 ? settings.daily_budget_jpy / USD_JPY : Infinity;
    const spentBeforeUsd = await todaySpendUsd(supabase);
    if (spentBeforeUsd >= budgetUsd) {
      return NextResponse.json({
        paused: "budget",
        spent_jpy: Math.round(spentBeforeUsd * USD_JPY),
      });
    }

    const serpOk = !serpConfigError();
    let gbizOk: boolean | null = null;
    const stages: JobKind[] = ["research", "enrich"];
    if (settings.keyman_enabled) stages.push("keyman");

    const filter = { business_model_id: null, database_id: null };
    let dedup: Dedup = null;
    const start = Date.now();
    let runCostUsd = 0;
    let processed = 0;
    let didWork = false;

    while (Date.now() - start < BUDGET_MS) {
      if (spentBeforeUsd + runCostUsd >= budgetUsd) break;

      // 手動ジョブが投入されたら譲る(二重処理防止)
      const { count: jobCount } = await supabase
        .from("research_jobs")
        .select("id", { count: "exact", head: true })
        .in("status", ["queued", "running"]);
      if (jobCount && jobCount > 0) break;

      // 実行可能で未処理のあるステージを優先順(①→②→③)に探す
      let stageKind: JobKind | null = null;
      let units: Record<string, unknown>[] = [];
      for (const s of stages) {
        if ((s === "research" || s === "keyman") && !serpOk) continue;
        if (s === "enrich") {
          if (gbizOk === null) {
            try {
              await searchGbizByName("トヨタ自動車");
              gbizOk = true;
            } catch {
              gbizOk = false;
            }
          }
          if (!gbizOk) continue;
        }
        const u = await fetchPendingUnits(supabase, s, filter, CONCURRENCY[s]);
        if (u.length > 0) {
          stageKind = s;
          units = u;
          break;
        }
      }
      if (!stageKind) break; // どのステージも未処理なし

      if (stageKind === "research" && !dedup) {
        dedup = await loadExistingCompanyKeys(supabase);
      }
      const results = await Promise.all(
        units.map((x) => processUnit(supabase, stageKind as JobKind, x, dedup))
      );
      for (const r of results) {
        processed++;
        runCostUsd += r.cost;
        didWork = true;
      }
    }

    if (didWork) kickSelf(req, secret); // まだ残っていれば即継続(失敗しても毎分Cronが継続)
    return NextResponse.json({
      pipeline: true,
      processed,
      spent_jpy: Math.round((spentBeforeUsd + runCostUsd) * USD_JPY),
      budget_jpy: settings.daily_budget_jpy,
    });
  } finally {
    await supabase.from("pipeline_settings").update({ locked_until: null }).eq("id", 1);
  }
}

function kickSelf(req: Request, secret: string | undefined) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 3000);
  const origin = new URL(req.url).origin;
  return fetch(`${origin}/api/cron/research`, {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
    signal: controller.signal,
  })
    .catch(() => {})
    .finally(() => clearTimeout(t));
}

async function failJob(supabase: SupabaseClient, id: string, message: string) {
  await supabase
    .from("research_jobs")
    .update({ status: "error", error: message, updated_at: new Date().toISOString() })
    .eq("id", id);
}
