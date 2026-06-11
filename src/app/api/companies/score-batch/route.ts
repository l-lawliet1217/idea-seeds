import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { scoreBudget } from "@/lib/claude";

export const maxDuration = 300;

const MAX_BATCH = 20;

// 未採点企業をまとめてスコアリングする
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body.limit) || 10, 1), MAX_BATCH);
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("companies")
    .select("id, name, revenue_jpy, employees, prefecture, segments(name, industries(name))")
    .is("budget_score", null)
    .eq("do_not_contact", false)
    .order("created_at")
    .limit(limit);
  if (body.segment_id) query = query.eq("segment_id", body.segment_id);

  const { data: companies, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!companies || companies.length === 0) {
    return NextResponse.json({ scored: 0, failed: 0, remaining: 0 });
  }

  let scored = 0;
  let failed = 0;
  for (const company of companies) {
    try {
      const segment = company.segments as unknown as {
        industries: { name: string } | null;
      } | null;
      const result = await scoreBudget({
        name: company.name,
        revenue_jpy: company.revenue_jpy,
        employees: company.employees,
        industry: segment?.industries?.name ?? null,
        prefecture: company.prefecture,
      });
      await supabase
        .from("companies")
        .update({
          budget_score: result.score,
          budget_score_reason: result.reason,
          updated_at: new Date().toISOString(),
        })
        .eq("id", company.id);
      scored++;
    } catch {
      failed++;
    }
  }

  const { count } = await supabase
    .from("companies")
    .select("*", { count: "exact", head: true })
    .is("budget_score", null)
    .eq("do_not_contact", false);

  return NextResponse.json({ scored, failed, remaining: count ?? 0 });
}
