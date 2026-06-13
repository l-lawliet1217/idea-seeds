import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/lib/supabase-server";

// 単価(USD)。出典: platform.claude.com/docs (2026-06時点)
// claude-sonnet-4-6: 入力$3/M、出力$15/M
// キャッシュ読み取り0.1x、キャッシュ書き込み1.25x、web検索$10/1000回
const PRICING: Record<
  string,
  { input: number; output: number }
> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};
const WEB_SEARCH_COST_PER_REQUEST = 0.01;

export type UsageRecord = {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  web_searches: number;
};

export function extractUsage(usage: Anthropic.Messages.Usage): UsageRecord {
  return {
    input_tokens: usage.input_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0,
    cache_read_tokens: usage.cache_read_input_tokens ?? 0,
    cache_creation_tokens: usage.cache_creation_input_tokens ?? 0,
    web_searches:
      (usage as { server_tool_use?: { web_search_requests?: number } })
        .server_tool_use?.web_search_requests ?? 0,
  };
}

export function estimateCostUsd(model: string, u: UsageRecord): number {
  const price = PRICING[model] ?? PRICING["claude-sonnet-4-6"];
  const tokensCost =
    (u.input_tokens * price.input +
      u.output_tokens * price.output +
      u.cache_read_tokens * price.input * 0.1 +
      u.cache_creation_tokens * price.input * 1.25) /
    1_000_000;
  return tokensCost + u.web_searches * WEB_SEARCH_COST_PER_REQUEST;
}

// SerpAPIの1検索あたり概算単価(USD)。プランにより異なるため環境変数で上書き可能。
// 既定$0.015(SerpAPIの一般的な有料プラン: $75/5,000検索相当)
const SERP_COST_PER_SEARCH = Number(process.env.SERPAPI_COST_PER_SEARCH) || 0.015;

// SerpAPIの検索回数・概算コストを記録し、コスト(USD)を返す。
// Claudeのトークン課金とは別系統なので model="serpapi" の行として記録する
// (検索回数は web_searches 列を流用。Claudeのweb検索ツールは現在未使用)
export async function logSerpUsage(
  kind: string,
  searches: number,
  meta?: Record<string, unknown>
): Promise<number> {
  const cost = searches * SERP_COST_PER_SEARCH;
  if (searches <= 0) return 0;
  try {
    await getSupabaseAdmin().from("api_usage_logs").insert({
      kind,
      model: "serpapi",
      web_searches: searches,
      estimated_cost_usd: cost,
      meta: meta ?? null,
    });
  } catch {
    // テーブル未作成(マイグレーション00007未適用)でも本処理は継続
  }
  return cost;
}

// 利用量をDBに記録し、概算コスト(USD)を返す。記録失敗は呼び出し元の処理を妨げない
export async function logApiUsage(
  kind: string,
  model: string,
  u: UsageRecord,
  meta?: Record<string, unknown>
): Promise<number> {
  const cost = estimateCostUsd(model, u);
  try {
    await getSupabaseAdmin().from("api_usage_logs").insert({
      kind,
      model,
      input_tokens: u.input_tokens,
      output_tokens: u.output_tokens,
      cache_read_tokens: u.cache_read_tokens,
      cache_creation_tokens: u.cache_creation_tokens,
      web_searches: u.web_searches,
      estimated_cost_usd: cost,
      meta: meta ?? null,
    });
  } catch {
    // テーブル未作成(マイグレーション00007未適用)でも本処理は継続
  }
  return cost;
}
