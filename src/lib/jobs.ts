import type { SupabaseClient } from "@supabase/supabase-js";
import { serpCostPerSearch } from "@/lib/usage";

export type JobKind = "research" | "enrich" | "keyman";

export const JOB_KINDS: JobKind[] = ["research", "enrich", "keyman"];

// 概算の為替レート(円/USD)。コスト事前通知の円換算に使用。
export const USD_JPY = 160;

export type JobFilter = {
  business_model_id: string | null;
  database_id: string | null;
};

// 各種ジョブの未処理「単位」数を数える(1000行上限の影響を受けないcount)。
export async function countPendingUnits(
  supabase: SupabaseClient,
  kind: JobKind,
  filter: JobFilter
): Promise<number> {
  if (kind === "research") {
    let q = supabase
      .from("segments")
      .select("id, industries!inner(database_id)", { count: "exact", head: true })
      .eq("research_done", false);
    if (filter.business_model_id) q = q.eq("business_model_id", filter.business_model_id);
    if (filter.database_id) q = q.eq("industries.database_id", filter.database_id);
    const { count } = await q;
    return count ?? 0;
  }

  if (kind === "enrich") {
    let q = supabase
      .from("companies")
      .select("id, segments!inner(business_model_id, industries!inner(database_id))", {
        count: "exact",
        head: true,
      })
      .eq("enrich_done", false)
      .not("name", "is", null)
      .or("corporate_number.is.null,and(employees.is.null,capital_jpy.is.null)");
    if (filter.business_model_id)
      q = q.eq("segments.business_model_id", filter.business_model_id);
    if (filter.database_id)
      q = q.eq("segments.industries.database_id", filter.database_id);
    const { count } = await q;
    return count ?? 0;
  }

  // keyman: 社名あり・未調査・架電拒否でない企業
  let q = supabase
    .from("companies")
    .select("id, segments!inner(business_model_id, industries!inner(database_id))", {
      count: "exact",
      head: true,
    })
    .eq("keyman_research_done", false)
    .eq("do_not_contact", false)
    .not("name", "is", null);
  if (filter.business_model_id)
    q = q.eq("segments.business_model_id", filter.business_model_id);
  if (filter.database_id)
    q = q.eq("segments.industries.database_id", filter.database_id);
  const { count } = await q;
  return count ?? 0;
}

// 1単位あたりの概算コスト(USD)。事前通知用のざっくり見積り。
export function unitCostUsd(kind: JobKind): number {
  const serp = serpCostPerSearch();
  if (kind === "research") return serp + 0.004; // SERP1回 + Haiku選別 + Sonnet抽出(小)
  if (kind === "enrich") return 0; // gBizINFO(無料)
  return serp * 4 + 0.02; // keyman: SERP4回 + Sonnet
}

export function estimateCost(kind: JobKind, units: number): {
  usd: number;
  jpy: number;
} {
  const usd = unitCostUsd(kind) * units;
  return { usd, jpy: Math.round(usd * USD_JPY) };
}

// 未処理「単位」をバッチ分だけ取得する(kind別)。
export async function fetchPendingUnits(
  supabase: SupabaseClient,
  kind: JobKind,
  filter: JobFilter,
  limit: number
): Promise<Record<string, unknown>[]> {
  if (kind === "research") {
    let q = supabase
      .from("segments")
      .select("id, name, industries!inner(database_id)")
      .eq("research_done", false)
      .order("id")
      .limit(limit);
    if (filter.business_model_id) q = q.eq("business_model_id", filter.business_model_id);
    if (filter.database_id) q = q.eq("industries.database_id", filter.database_id);
    const { data } = await q;
    return (data ?? []) as Record<string, unknown>[];
  }

  if (kind === "enrich") {
    let q = supabase
      .from("companies")
      .select(
        "id, name, corporate_number, segments!inner(business_model_id, industries!inner(database_id))"
      )
      .eq("enrich_done", false)
      .not("name", "is", null)
      .or("corporate_number.is.null,and(employees.is.null,capital_jpy.is.null)")
      .order("id")
      .limit(limit);
    if (filter.business_model_id)
      q = q.eq("segments.business_model_id", filter.business_model_id);
    if (filter.database_id)
      q = q.eq("segments.industries.database_id", filter.database_id);
    const { data } = await q;
    return (data ?? []) as Record<string, unknown>[];
  }

  let q = supabase
    .from("companies")
    .select(
      "id, name, service_name, service_url, website_url, phone, segments!inner(business_model_id, industries!inner(database_id))"
    )
    .eq("keyman_research_done", false)
    .eq("do_not_contact", false)
    .not("name", "is", null)
    .order("id")
    .limit(limit);
  if (filter.business_model_id)
    q = q.eq("segments.business_model_id", filter.business_model_id);
  if (filter.database_id)
    q = q.eq("segments.industries.database_id", filter.database_id);
  const { data } = await q;
  return (data ?? []) as Record<string, unknown>[];
}
