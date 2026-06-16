import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getGbizCompanyDetail,
  normalizeCompanyName,
  searchGbizByNameFlexible,
} from "@/lib/gbizinfo";

export type EnrichCompany = {
  id: string;
  name: string;
  corporate_number: string | null;
};

export type EnrichResult = {
  updated: boolean;
  notFound: boolean;
  duplicated: boolean;
  noData: boolean;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// 1社分の法人番号・従業員数・資本金をgBizINFO(無料)から補完する。
// 成否に関わらず呼び出し元で enrich_done を立てて再試行ループを防ぐこと。
export async function enrichOneCompany(
  supabase: SupabaseClient,
  company: EnrichCompany
): Promise<EnrichResult> {
  let corporateNumber = company.corporate_number;
  if (!corporateNumber) {
    const results = await searchGbizByNameFlexible(company.name);
    const normalized = normalizeCompanyName(company.name);
    const exact = results.find((r) => normalizeCompanyName(r.name) === normalized);
    const containing = results.filter((r) => {
      const rn = normalizeCompanyName(r.name);
      return rn.includes(normalized) || normalized.includes(rn);
    });
    const match =
      exact ??
      (containing.length === 1 ? containing[0] : undefined) ??
      (results.length === 1 ? results[0] : undefined);

    if (!match) {
      await sleep(700);
      return { updated: false, notFound: true, duplicated: false, noData: false };
    }

    // 同じ法人番号が既に別行にあれば重複行とみなしてスキップ
    const { data: dup } = await supabase
      .from("companies")
      .select("id")
      .eq("corporate_number", match.corporate_number)
      .neq("id", company.id)
      .limit(1);
    if (dup && dup.length > 0) {
      await supabase
        .from("companies")
        .update({
          note: `重複の可能性: 法人番号${match.corporate_number}は別の企業行に登録済み`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", company.id);
      await sleep(700);
      return { updated: false, notFound: false, duplicated: true, noData: false };
    }
    corporateNumber = match.corporate_number;
  }

  const detail = await getGbizCompanyDetail(corporateNumber);
  const update: Record<string, unknown> = {
    corporate_number: corporateNumber,
    updated_at: new Date().toISOString(),
  };
  if (detail?.employee_number != null) update.employees = detail.employee_number;
  if (detail?.capital_stock != null) update.capital_jpy = detail.capital_stock;
  if (detail?.location) {
    const m = detail.location.match(/^(.{2,3}?[都道府県])/);
    if (m) update.prefecture = m[1];
  }
  const noData = detail?.employee_number == null && detail?.capital_stock == null;

  const { error: updateError } = await supabase
    .from("companies")
    .update(update)
    .eq("id", company.id);
  await sleep(700); // gBizINFOのレート制限対策
  if (updateError) {
    if (updateError.code === "23505") {
      return { updated: false, notFound: false, duplicated: true, noData: false };
    }
    throw new Error(updateError.message);
  }
  return { updated: true, notFound: false, duplicated: false, noData };
}
