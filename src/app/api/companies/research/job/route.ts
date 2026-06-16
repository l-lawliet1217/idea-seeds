import { NextResponse, after } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { serpConfigError } from "@/lib/serp";
import {
  JOB_MODES,
  JobMode,
  ALL_PHASES,
  countPendingUnits,
} from "@/lib/jobs";

const MAX_SEGMENTS_CAP = 2000;

const KIND_EMPTY_MESSAGE: Record<JobMode, string> = {
  research:
    "未収集のセグメントがありません(セグメントタブの「企業収集」チェックを外すと再収集できます)",
  enrich: "法人番号・属性の取得対象企業がありません(社名取得済みの企業が対象です)",
  keyman: "キーマン調査の対象企業がありません(社名取得済み・未調査・架電可の企業が対象です)",
  all: "未処理の対象がありません(①〜③すべて処理済みです)",
};

// バックグラウンドジョブを作成する(kind: research / enrich / keyman / all)。
// 特化先DB×ビジネスモデルの指定があればその範囲、無指定なら全社が対象。
// kind='all' は ①research → ②enrich → ③keyman をサーバー側で順に処理する。
export async function POST(req: Request) {
  const body = await req.json();
  const businessModelId: string | undefined = body.business_model_id || undefined;
  const databaseId: string | undefined = body.database_id || undefined;
  const kind: JobMode = JOB_MODES.includes(body.kind) ? body.kind : "research";
  const maxSegments = Math.min(
    Math.max(1, Number(body.max_segments) || 500),
    MAX_SEGMENTS_CAP
  );

  // enrich単体以外はSERP設定が必要(all/research/keyman)
  if (kind !== "enrich") {
    const serpConfigErr = serpConfigError();
    if (serpConfigErr) {
      return NextResponse.json({ error: serpConfigErr }, { status: 503 });
    }
  }

  const supabase = getSupabaseAdmin();
  const filter = {
    business_model_id: businessModelId ?? null,
    database_id: databaseId ?? null,
  };

  // 同時実行は1ジョブまで(進行中があれば拒否)
  const { data: active } = await supabase
    .from("research_jobs")
    .select("id, status")
    .in("status", ["queued", "running"])
    .limit(1)
    .maybeSingle();
  if (active) {
    return NextResponse.json(
      { error: "実行中のジョブがあります。完了またはキャンセル後に開始してください", job_id: active.id },
      { status: 409 }
    );
  }

  // 対象件数を算出。all は最初のフェーズ(research)を total に据え、未処理が全フェーズ0なら拒否
  let total = 0;
  let phase: string | null = null;
  try {
    if (kind === "all") {
      phase = "research";
      const counts = await Promise.all(
        ALL_PHASES.map((p) => countPendingUnits(supabase, p, filter))
      );
      if (counts.every((c) => c === 0)) {
        return NextResponse.json({ error: KIND_EMPTY_MESSAGE.all }, { status: 400 });
      }
      total = Math.min(counts[0], maxSegments); // research フェーズの対象数
    } else {
      const count = await countPendingUnits(supabase, kind, filter);
      total = Math.min(count, maxSegments);
      if (total === 0) {
        return NextResponse.json({ error: KIND_EMPTY_MESSAGE[kind] }, { status: 400 });
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "対象件数の取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { data: job, error } = await supabase
    .from("research_jobs")
    .insert({
      kind,
      phase,
      business_model_id: businessModelId ?? null,
      database_id: databaseId ?? null,
      max_segments: maxSegments,
      status: "queued",
      total,
    })
    .select()
    .single();
  if (error) {
    const message = /schema cache|does not exist|column .* does not exist/.test(error.message)
      ? "ジョブ用テーブルが未作成です。マイグレーション 00010_research_jobs.sql / 00011_job_kinds.sql / 00012_job_phase.sql をSupabaseのSQL Editorで適用してください(/setup で確認できます)"
      : error.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // 即時開始のキック(レスポンス後に実行。失敗しても毎分のCronが拾う)
  after(() => kickProcessor(req));

  return NextResponse.json(job, { status: 201 });
}

// 最新(または指定id)のジョブ状態を返す
export async function GET(req: Request) {
  const supabase = getSupabaseAdmin();
  const id = new URL(req.url).searchParams.get("id");
  let query = supabase.from("research_jobs").select("*");
  if (id) query = query.eq("id", id);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// ジョブのキャンセル
export async function PATCH(req: Request) {
  const supabase = getSupabaseAdmin();
  const body = await req.json().catch(() => ({}));
  const id = body.id;
  if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 });
  const { data, error } = await supabase
    .from("research_jobs")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["queued", "running"])
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? { canceled: false });
}

async function kickProcessor(req: Request) {
  const secret = process.env.CRON_SECRET;
  // リクエストを送るだけ。処理(最大240秒)の完了は待たずに離脱する。
  // 届かなくても毎分のCronが処理を継続する。
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 3000);
  try {
    const origin = new URL(req.url).origin;
    await fetch(`${origin}/api/cron/research`, {
      headers: secret ? { authorization: `Bearer ${secret}` } : {},
      signal: controller.signal,
    });
  } catch {
    // abort/失敗は無視(Cronが継続)
  } finally {
    clearTimeout(t);
  }
}
