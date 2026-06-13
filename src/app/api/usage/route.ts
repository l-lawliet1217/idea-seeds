import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

// AI利用コストのサマリー(今日・今月)
export async function GET() {
  const supabase = getSupabaseAdmin();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const dayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).toISOString();

  const { data, error } = await supabase
    .from("api_usage_logs")
    .select("estimated_cost_usd, web_searches, model, created_at")
    .gte("created_at", monthStart);
  if (error) {
    // マイグレーション00007未適用の場合はゼロ表示
    return NextResponse.json({
      month_usd: 0,
      today_usd: 0,
      month_serp_searches: 0,
      month_serp_usd: 0,
    });
  }

  let monthUsd = 0;
  let todayUsd = 0;
  let monthSerpSearches = 0;
  let monthSerpUsd = 0;
  for (const row of data ?? []) {
    const cost = Number(row.estimated_cost_usd) || 0;
    monthUsd += cost;
    if (row.created_at >= dayStart) todayUsd += cost;
    // SerpAPI分(model="serpapi")は検索回数・金額を別集計
    if (row.model === "serpapi") {
      monthSerpSearches += row.web_searches ?? 0;
      monthSerpUsd += cost;
    }
  }
  return NextResponse.json({
    month_usd: Math.round(monthUsd * 10000) / 10000,
    today_usd: Math.round(todayUsd * 10000) / 10000,
    month_serp_searches: monthSerpSearches,
    month_serp_usd: Math.round(monthSerpUsd * 10000) / 10000,
  });
}
