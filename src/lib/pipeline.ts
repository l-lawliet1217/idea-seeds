import type { SupabaseClient } from "@supabase/supabase-js";
import { USD_JPY } from "@/lib/jobs";

export type PipelineSettings = {
  enabled: boolean;
  keyman_enabled: boolean;
  daily_budget_jpy: number;
};

export async function getPipelineSettings(
  supabase: SupabaseClient
): Promise<PipelineSettings> {
  const { data } = await supabase
    .from("pipeline_settings")
    .select("enabled, keyman_enabled, daily_budget_jpy")
    .eq("id", 1)
    .maybeSingle();
  return {
    enabled: data?.enabled ?? false,
    keyman_enabled: data?.keyman_enabled ?? false,
    daily_budget_jpy: data?.daily_budget_jpy ?? 0,
  };
}

// 当日(JST)の概算API支出(USD)。RPCで軽量に合計する。
export async function todaySpendUsd(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc("today_spend_usd");
  if (error) return 0;
  return Number(data) || 0;
}

export function usdToJpy(usd: number): number {
  return Math.round(usd * USD_JPY);
}
