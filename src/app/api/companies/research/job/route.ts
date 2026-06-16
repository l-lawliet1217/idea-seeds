import { NextResponse, after } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { serpConfigError } from "@/lib/serp";

const MAX_SEGMENTS_CAP = 2000;

// バックグラウンドの企業リサーチジョブを作成する。
// 選択中の特化先DB×ビジネスモデルの未収集セグメントを、サーバー(Cron)が順次処理する。
export async function POST(req: Request) {
  const body = await req.json();
  const businessModelId: string | undefined = body.business_model_id || undefined;
  const databaseId: string | undefined = body.database_id || undefined;
  if (!businessModelId || !databaseId) {
    return NextResponse.json(
      { error: "business_model_id と database_id は必須です" },
      { status: 400 }
    );
  }
  const maxSegments = Math.min(
    Math.max(1, Number(body.max_segments) || 500),
    MAX_SEGMENTS_CAP
  );

  const serpConfigErr = serpConfigError();
  if (serpConfigErr) {
    return NextResponse.json({ error: serpConfigErr }, { status: 503 });
  }

  const supabase = getSupabaseAdmin();

  // 同時実行は1ジョブまで(進行中があれば拒否)
  const { data: active } = await supabase
    .from("research_jobs")
    .select("id, status")
    .in("status", ["queued", "running"])
    .limit(1)
    .maybeSingle();
  if (active) {
    return NextResponse.json(
      { error: "実行中のリサーチジョブがあります。完了またはキャンセル後に開始してください", job_id: active.id },
      { status: 409 }
    );
  }

  // 未収集セグメント数(countは1000行上限の影響を受けない)
  const { count, error: countError } = await supabase
    .from("segments")
    .select("id, industries!inner(database_id)", { count: "exact", head: true })
    .eq("research_done", false)
    .eq("business_model_id", businessModelId)
    .eq("industries.database_id", databaseId);
  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }
  const total = Math.min(count ?? 0, maxSegments);
  if (total === 0) {
    return NextResponse.json(
      { error: "未収集のセグメントがありません(セグメントタブの「企業収集」チェックを外すと再収集できます)" },
      { status: 400 }
    );
  }

  const { data: job, error } = await supabase
    .from("research_jobs")
    .insert({
      business_model_id: businessModelId,
      database_id: databaseId,
      max_segments: maxSegments,
      status: "queued",
      total,
    })
    .select()
    .single();
  if (error) {
    const message = /schema cache|does not exist/.test(error.message)
      ? "research_jobs テーブルが未作成です。マイグレーション 00010_research_jobs.sql をSupabaseのSQL Editorで適用してください(/setup で確認できます)"
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
