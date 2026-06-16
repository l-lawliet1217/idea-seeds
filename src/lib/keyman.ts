import type { SupabaseClient } from "@supabase/supabase-js";
import { KeymanEvidence, researchKeyman } from "@/lib/claude";
import { extractPhoneNumber, fetchHtml, fetchSerpResults } from "@/lib/serp";
import { extractUsage, logApiUsage, logSerpUsage } from "@/lib/usage";

export type KeymanCompany = {
  id: string;
  name: string;
  service_name: string | null;
  service_url: string | null;
  website_url: string | null;
  phone: string | null;
};

export type KeymanResult = {
  contacts_inserted: number;
  relations_inserted: number;
  skipped_no_source: number;
  cost_usd: number;
  serp_searches: number;
};

// 1社分のキーマン・ベンダー・投資家をSERP+Claudeで調査して登録する。
// 全クエリがSERPエラーのときは throw(呼び出し元で keyman_research_done を立てて再試行防止)。
export async function researchKeymanForCompany(
  supabase: SupabaseClient,
  company: KeymanCompany
): Promise<KeymanResult> {
  const id = company.id;
  const queries = [
    `${company.name} 代表取締役 役員`,
    `${company.name} 資金調達 出資`,
    `${company.name} 導入事例 支援`,
    `${company.name} マーケティング 担当 インタビュー`,
  ];
  const evidence: KeymanEvidence[] = [];
  const errors: string[] = [];
  let serpSearches = 0;
  for (const query of queries) {
    try {
      const results = await fetchSerpResults(query, 5, "desktop");
      serpSearches++;
      for (const r of results) {
        evidence.push({ query, title: r.title, url: r.url, snippet: r.snippet });
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  const serpCost = await logSerpUsage("keyman", serpSearches, {
    company_id: id,
    company: company.name,
  });

  if (evidence.length === 0 && errors.length === queries.length) {
    throw new Error(`SERP API検索に失敗しました(${errors[0]})`);
  }

  if (evidence.length === 0) {
    await supabase
      .from("companies")
      .update({ keyman_research_done: true, updated_at: new Date().toISOString() })
      .eq("id", id);
    return {
      contacts_inserted: 0,
      relations_inserted: 0,
      skipped_no_source: 0,
      cost_usd: serpCost,
      serp_searches: serpSearches,
    };
  }

  const result = await researchKeyman({
    companyName: company.name,
    serviceName: company.service_name,
    evidence,
  });
  const claudeCost = await logApiUsage(
    "keyman",
    "claude-sonnet-4-6",
    extractUsage(result.usage),
    { company_id: id, company: company.name }
  );
  const costUsd = claudeCost + serpCost;

  const [{ data: existingContacts }, { data: existingRelations }] = await Promise.all([
    supabase.from("contacts").select("name").eq("company_id", id),
    supabase.from("company_relations").select("related_name").eq("company_id", id),
  ]);
  const contactNames = new Set((existingContacts ?? []).map((c) => c.name));
  const relationNames = new Set((existingRelations ?? []).map((r) => r.related_name));

  let contactsInserted = 0;
  let skippedNoSource = 0;
  const contactRows: Record<string, unknown>[] = [];
  const pushPerson = (
    person: {
      name: string;
      department: string | null;
      position: string | null;
      phone: string | null;
      source: string | null;
    },
    role: "executive" | "marketing"
  ) => {
    if (!person.source || !/^https?:\/\//.test(person.source)) {
      skippedNoSource++;
      return;
    }
    if (contactNames.has(person.name)) return;
    contactNames.add(person.name);
    contactRows.push({
      company_id: id,
      name: person.name,
      role,
      title: person.position,
      department: person.department,
      phone: person.phone,
      source_url: person.source,
    });
  };
  result.executives.forEach((p) => pushPerson(p, "executive"));
  result.marketing.forEach((p) => pushPerson(p, "marketing"));
  if (contactRows.length > 0) {
    const { error: contactError } = await supabase.from("contacts").insert(contactRows);
    if (!contactError) contactsInserted = contactRows.length;
  }

  let relationsInserted = 0;
  const relationRows: Record<string, unknown>[] = [];
  for (const vendor of result.vendors) {
    if (!vendor.source || relationNames.has(vendor.name)) {
      if (!vendor.source) skippedNoSource++;
      continue;
    }
    relationNames.add(vendor.name);
    relationRows.push({
      company_id: id,
      related_name: vendor.name,
      relation_type: "vendor",
      category: vendor.category,
      detail: vendor.usage,
      website_url: vendor.website,
      source_url: vendor.source,
    });
  }
  for (const investor of result.investors) {
    if (!investor.source || relationNames.has(investor.name)) {
      if (!investor.source) skippedNoSource++;
      continue;
    }
    relationNames.add(investor.name);
    relationRows.push({
      company_id: id,
      related_name: investor.name,
      relation_type: "investor",
      detail: [investor.round, investor.date].filter(Boolean).join(" / ") || null,
      source_url: investor.source,
    });
  }
  if (relationRows.length > 0) {
    const { error: relationError } = await supabase
      .from("company_relations")
      .insert(relationRows);
    if (!relationError) relationsInserted = relationRows.length;
  }

  const companyUpdate: Record<string, unknown> = {
    keyman_research_done: true,
    updated_at: new Date().toISOString(),
  };
  if (!company.phone) {
    let phone: string | null = null;
    const pageUrl = company.service_url ?? company.website_url;
    if (pageUrl) {
      const html = await fetchHtml(pageUrl);
      if (html) phone = extractPhoneNumber(html);
    }
    phone = phone ?? result.main_phone;
    if (phone) companyUpdate.phone = phone;
  }
  await supabase.from("companies").update(companyUpdate).eq("id", id);

  return {
    contacts_inserted: contactsInserted,
    relations_inserted: relationsInserted,
    skipped_no_source: skippedNoSource,
    cost_usd: costUsd,
    serp_searches: serpSearches,
  };
}
