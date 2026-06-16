import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { serpConfigError } from "@/lib/serp";
import { searchGbizByName } from "@/lib/gbizinfo";
import { researchSegment, loadExistingCompanyKeys } from "@/lib/research";
import { enrichOneCompany } from "@/lib/enrich";
import { researchKeymanForCompany } from "@/lib/keyman";
import { JobKind, fetchPendingUnits } from "@/lib/jobs";

export const maxDuration = 300;

const BUDGET_MS = 240_000; // この時間を超えたら一旦終了し、再キック/次のCronで継続
const STALE_MS = 180_000; // 実行中ジョブのheartbeatがこれより古ければ別ワーカーが引き取る
const CONCURRENCY: Record<JobKind, number> = { research: 5, enrich: 2, keyman: 3 };

type Job = {
  id: string;
  kind: JobKind;
  business_model_id: string | null;
  database_id: string | null;
  total: number;
  processed: number;
  inserted: number;
  failed: number;
  cost_usd: number;
};

type UnitOutcome = { ok: boolean; inserted: number; cost: number };

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
  const kind: JobKind = job.kind ?? "research";

  // 事前チェック(全件失敗を防ぐ)
  if (kind === "enrich") {
    try {
      await searchGbizByName("トヨタ自動車");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await failJob(supabase, job.id, `gBizINFOへの接続に失敗: ${message}`);
      return NextResponse.json({ error: message }, { status: 503 });
    }
  } else {
    const serpConfigErr = serpConfigError();
    if (serpConfigErr) {
      await failJob(supabase, job.id, serpConfigErr);
      return NextResponse.json({ error: serpConfigErr }, { status: 503 });
    }
  }

  const start = Date.now();
  let processed = job.processed;
  let inserted = job.inserted;
  let failed = job.failed;
  let cost = job.cost_usd;

  // research の重複判定キーは1呼び出しにつき1回だけ読み込み、登録分を追記して共有する
  const dedup = kind === "research" ? await loadExistingCompanyKeys(supabase) : null;
  const concurrency = CONCURRENCY[kind];

  while (Date.now() - start < BUDGET_MS && processed < job.total) {
    const { data: state } = await supabase
      .from("research_jobs")
      .select("status")
      .eq("id", job.id)
      .single();
    if (state?.status === "canceled") {
      return NextResponse.json({ canceled: true });
    }

    const batchSize = Math.min(concurrency, job.total - processed);
    const units = await fetchPendingUnits(
      supabase,
      kind,
      { business_model_id: job.business_model_id, database_id: job.database_id },
      batchSize
    );
    if (units.length === 0) {
      processed = job.total; // 未処理が尽きた
      break;
    }

    const results = await Promise.all(
      units.map((unit) => processUnit(supabase, kind, unit, dedup))
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
        inserted,
        failed,
        cost_usd: cost,
        heartbeat_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
  }

  const done = processed >= job.total;
  const finishedAt = new Date().toISOString();
  // 未完了ならロックを解放(status=queued)して、再キック/次のCronが即座に継続できるようにする
  await supabase
    .from("research_jobs")
    .update({
      status: done ? "done" : "queued",
      processed,
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

  return NextResponse.json({ job_id: job.id, kind, processed, inserted, failed, done });
}

// 1単位を処理する。done系フラグを必ず立てて再試行ループを防ぐ。
async function processUnit(
  supabase: SupabaseClient,
  kind: JobKind,
  unit: Record<string, unknown>,
  dedup: { domains: Set<string>; names: Set<string> } | null
): Promise<UnitOutcome> {
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
    // keyman
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
    // 失敗した単位も done にして再試行ループを防ぐ
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
