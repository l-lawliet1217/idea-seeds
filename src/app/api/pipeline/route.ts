import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { getPipelineSettings, todaySpendUsd, usdToJpy } from "@/lib/pipeline";

async function count(
  build: () => PromiseLike<{ count: number | null }>
): Promise<number> {
  const { count } = await build();
  return count ?? 0;
}

// 自動収集の設定・ファネル・当日支出をまとめて返す
export async function GET() {
  const supabase = getSupabaseAdmin();
  const settings = await getPipelineSettings(supabase);

  const c = (q: () => PromiseLike<{ count: number | null }>) => count(q);
  const [
    segTotal,
    segDone,
    coTotal,
    coEnriched,
    coKeyman,
    coExcluded,
    coCandidate,
    activeJob,
  ] = await Promise.all([
    c(() => supabase.from("segments").select("id", { count: "exact", head: true })),
    c(() =>
      supabase.from("segments").select("id", { count: "exact", head: true }).eq("research_done", true)
    ),
    c(() => supabase.from("companies").select("id", { count: "exact", head: true })),
    c(() =>
      supabase.from("companies").select("id", { count: "exact", head: true }).not("corporate_number", "is", null)
    ),
    c(() =>
      supabase.from("companies").select("id", { count: "exact", head: true }).eq("keyman_research_done", true)
    ),
    c(() =>
      supabase.from("companies").select("id", { count: "exact", head: true }).eq("status", "excluded")
    ),
    c(() =>
      supabase.from("companies").select("id", { count: "exact", head: true }).eq("status", "candidate")
    ),
    c(() =>
      supabase.from("research_jobs").select("id", { count: "exact", head: true }).in("status", ["queued", "running"])
    ),
  ]);

  const spentUsd = await todaySpendUsd(supabase);

  return NextResponse.json({
    settings,
    funnel: {
      segments_total: segTotal,
      segments_done: segDone,
      companies_total: coTotal,
      companies_enriched: coEnriched,
      companies_keyman: coKeyman,
      companies_candidate: coCandidate,
      companies_excluded: coExcluded,
    },
    today_spent_jpy: usdToJpy(spentUsd),
    manual_job_active: activeJob > 0,
  });
}

// 設定更新(自動収集ON/OFF・③自動化・日次予算)
export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (typeof body.keyman_enabled === "boolean") patch.keyman_enabled = body.keyman_enabled;
  if (body.daily_budget_jpy != null) {
    patch.daily_budget_jpy = Math.max(0, Math.floor(Number(body.daily_budget_jpy) || 0));
  }
  const { data, error } = await getSupabaseAdmin()
    .from("pipeline_settings")
    .update(patch)
    .eq("id", 1)
    .select("enabled, keyman_enabled, daily_budget_jpy")
    .maybeSingle();
  if (error) {
    const message = /schema cache|does not exist/.test(error.message)
      ? "pipeline_settings テーブルが未作成です。マイグレーション 00014_pipeline_settings.sql を適用してください"
      : error.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }
  return NextResponse.json(data);
}
