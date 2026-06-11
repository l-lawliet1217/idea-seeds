import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { scoreBudget } from "@/lib/claude";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: company, error } = await supabase
    .from("companies")
    .select("*, segments(name, industries(name))")
    .eq("id", id)
    .single();
  if (error || !company) {
    return NextResponse.json({ error: "企業が見つかりません" }, { status: 404 });
  }

  try {
    const result = await scoreBudget({
      name: company.name,
      revenue_jpy: company.revenue_jpy,
      employees: company.employees,
      industry: company.segments?.industries?.name ?? null,
      prefecture: company.prefecture,
    });

    const { error: updateError } = await supabase
      .from("companies")
      .update({
        budget_score: result.score,
        budget_score_reason: result.reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await supabase.from("activities").insert({
      company_id: id,
      activity_type: "score_updated",
      summary: `支払余力スコアを更新: ${result.score}点`,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "スコアリングに失敗しました" },
      { status: 500 }
    );
  }
}
