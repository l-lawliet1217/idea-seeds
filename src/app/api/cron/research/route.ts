import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { serpConfigError } from "@/lib/serp";
import { researchSegment, loadExistingCompanyKeys } from "@/lib/research";

export const maxDuration = 300;

const BUDGET_MS = 240_000; // この時間を超えたら一旦終了し、再キック/次のCronで継続
const CONCURRENCY = 5;
const STALE_MS = 180_000; // 実行中ジョブのheartbeatがこれより古ければ別ワーカーが引き取る

type Job = {
  id: string;
  business_model_id: string | null;
  database_id: string | null;
  total: number;
  processed: number;
  inserted: number;
  failed: number;
  cost_usd: number;
};

// Vercel Cron(毎分)またはジョブ作成時のキックから呼ばれる。CRON_SECRETで保護。
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - STALE_MS).toISOString();

  // 進行中/待機中のジョブを1件取得
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

  const serpConfigErr = serpConfigError();
  if (serpConfigErr) {
    await supabase
      .from("research_jobs")
      .update({ status: "error", error: serpConfigErr, updated_at: now })
      .eq("id", claimed.id);
    return NextResponse.json({ error: serpConfigErr }, { status: 503 });
  }

  const job = claimed as Job;
  const start = Date.now();
  let processed = job.processed;
  let inserted = job.inserted;
  let failed = job.failed;
  let cost = job.cost_usd;

  // 既存企業の重複判定キーは1バッチ呼び出しにつき1回だけ読み込み、登録分を追記して共有する
  const dedup = await loadExistingCompanyKeys(supabase);

  while (Date.now() - start < BUDGET_MS && processed < job.total) {
    // キャンセル確認
    const { data: state } = await supabase
      .from("research_jobs")
      .select("status")
      .eq("id", job.id)
      .single();
    if (state?.status === "canceled") {
      return NextResponse.json({ canceled: true });
    }

    const batchSize = Math.min(CONCURRENCY, job.total - processed);
    const segs = await fetchUnresearchedSegments(supabase, job, batchSize);
    if (segs.length === 0) {
      processed = job.total; // 未収集が尽きた
      break;
    }

    const results = await Promise.all(
      segs.map(async (seg) => {
        try {
          const r = await researchSegment(supabase, seg, dedup);
          return { ok: true, inserted: r.inserted, cost: r.cost_usd };
        } catch {
          // 失敗セグメントも収集済みにして再試行ループを防ぐ
          await supabase
            .from("segments")
            .update({ research_done: true })
            .eq("id", seg.id);
          return { ok: false, inserted: 0, cost: 0 };
        }
      })
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
  // 未完了ならロックを解放(status=queued)して、再キック/次のCronが即座に継続できるようにする。
  // (runningのままだとheartbeatが新しく、stale待ち=最大3分の空転になる)
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

  // 未完了なら次の処理を即キック(送信だけして完了は待たない)。届かなくても毎分のCronが継続する
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

  return NextResponse.json({ job_id: job.id, processed, inserted, failed, done });
}

async function fetchUnresearchedSegments(
  supabase: SupabaseClient,
  job: Job,
  limit: number
): Promise<{ id: string; name: string }[]> {
  let query = supabase
    .from("segments")
    .select("id, name, industries!inner(database_id)")
    .eq("research_done", false)
    .order("id")
    .limit(limit);
  if (job.business_model_id) query = query.eq("business_model_id", job.business_model_id);
  if (job.database_id) query = query.eq("industries.database_id", job.database_id);
  const { data } = await query;
  return (data ?? []).map((s) => ({ id: s.id as string, name: s.name as string }));
}
