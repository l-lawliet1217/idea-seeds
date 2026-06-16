import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase-server";
import {
  extractCompanyNames,
  judgeSiteRelevance,
} from "@/lib/claude";
import {
  collectCompanyEvidence,
  extractDomain,
  extractPhoneNumber,
  extractSiteTitle,
  fetchHtml,
  fetchSerpResults,
  findCompanyInfoLinks,
} from "@/lib/serp";
import { extractUsage, logApiUsage, logSerpUsage } from "@/lib/usage";
import { normalizeCompanyName } from "@/lib/gbizinfo";

export type ResearchSegment = { id: string; name: string };

export type ResearchResult = {
  found: number;
  inserted: number;
  duplicates: number;
  cost_usd: number;
};

// 既存企業のドメイン集合・正規化社名集合を全件ページングで取得する。
// (1000件上限を超えると重複判定が壊れるため必ず全件読む)
export async function loadExistingCompanyKeys(supabase: SupabaseClient): Promise<{
  domains: Set<string>;
  names: Set<string>;
}> {
  const existing = await fetchAllRows<{
    name: string | null;
    service_url: string | null;
    website_url: string | null;
  }>(() =>
    supabase.from("companies").select("name, service_url, website_url").order("id")
  );
  const domains = new Set<string>();
  for (const row of existing) {
    for (const u of [row.service_url, row.website_url]) {
      const d = u ? extractDomain(u) : null;
      if (d) domains.add(d);
    }
  }
  const names = new Set<string>();
  for (const row of existing) {
    if (row.name) names.add(normalizeCompanyName(row.name));
  }
  return { domains, names };
}

// 1セグメントを高速リサーチして候補企業を登録する。
// dedup: 既存ドメイン/社名の集合を渡すと再取得せずそれを使い、登録した分を追記する
// (バックグラウンドのバッチ処理で1バッチ1回だけ読み込んで共有するため)。
// 渡さない場合は全件ページングで読み込む。
export async function researchSegment(
  supabase: SupabaseClient,
  segment: ResearchSegment,
  dedup?: { domains: Set<string>; names: Set<string> }
): Promise<ResearchResult> {
  // 1. Google検索の上位10件(SerpAPIは1検索単位の課金なので件数を増やしてもコスト同じ)
  const query = segment.name.replace(/\s*\/\s*/g, " ").replace(/\s+/g, " ").trim();
  const serp = await fetchSerpResults(query, 10, "desktop");
  let costUsd = await logSerpUsage("research_fast", 1, {
    segment_id: segment.id,
    segment: segment.name,
  });
  if (serp.length === 0) {
    await supabase.from("segments").update({ research_done: true }).eq("id", segment.id);
    return { found: 0, inserted: 0, duplicates: 0, cost_usd: costUsd };
  }

  const keys = dedup ?? (await loadExistingCompanyKeys(supabase));
  const existingDomains = keys.domains;
  const existingNames = keys.names;

  const seen = new Set<string>();
  const candidates = serp.filter((r) => {
    const domain = extractDomain(r.url);
    if (!domain || existingDomains.has(domain) || seen.has(domain)) return false;
    seen.add(domain);
    return true;
  });

  // 2. 該当しそうなサイトをHaikuで選別
  let picked = candidates;
  if (candidates.length > 0) {
    const judged = await judgeSiteRelevance(
      segment.name,
      candidates.map((c) => ({ title: c.title, url: c.url }))
    );
    costUsd += await logApiUsage(
      "research_fast",
      "claude-haiku-4-5",
      extractUsage(judged.usage),
      { segment_id: segment.id, segment: segment.name }
    );
    picked = judged.indices.map((i) => candidates[i]).slice(0, 5);
  }

  // 3. 各サイトのフッターと会社情報ページから運営会社名の証拠を収集(並列)
  const siteData = await Promise.all(
    picked.map(async (site, index) => {
      let serviceName = site.title;
      let phone: string | null = null;
      const evidence: string[] = [];
      const html = await fetchHtml(site.url);
      if (html) {
        serviceName = extractSiteTitle(html) ?? site.title;
        phone = extractPhoneNumber(html);
        evidence.push(...collectCompanyEvidence(html, "footer"));
        let infoLinks = findCompanyInfoLinks(html, site.url);
        if (infoLinks.length === 0) {
          try {
            const origin = new URL(site.url).origin;
            infoLinks = [`${origin}/company`, `${origin}/about`, `${origin}/corporate`];
          } catch {
            infoLinks = [];
          }
        }
        for (const link of infoLinks.slice(0, 3)) {
          const infoHtml = await fetchHtml(link);
          if (infoHtml) {
            evidence.push(...collectCompanyEvidence(infoHtml, "full"));
            if (!phone) phone = extractPhoneNumber(infoHtml);
          }
        }
      }
      return { index, url: site.url, service_name: serviceName, phone, evidence };
    })
  );

  // 4. 証拠から正式社名だけをHaikuで切り出す
  let names: Record<number, string | null> = {};
  if (siteData.length > 0) {
    const extraction = await extractCompanyNames(siteData);
    names = extraction.names;
    costUsd += await logApiUsage(
      "research_fast",
      "claude-sonnet-4-6",
      extractUsage(extraction.usage),
      { segment_id: segment.id, segment: segment.name, step: "extract_company" }
    );
  }

  const now = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];
  let duplicates = 0;
  for (const site of siteData) {
    const companyName = names[site.index] ?? "";
    if (companyName) {
      const normalized = normalizeCompanyName(companyName);
      if (existingNames.has(normalized)) {
        duplicates++;
        continue;
      }
      existingNames.add(normalized);
    }
    const domain = extractDomain(site.url);
    if (domain) existingDomains.add(domain);
    rows.push({
      segment_id: segment.id,
      name: companyName,
      service_name: site.service_name,
      service_url: site.url,
      website_url: site.url,
      phone: site.phone,
      status: "candidate",
      source: "serp_research",
      source_url: site.url,
      collected_at: now,
    });
  }

  await supabase.from("segments").update({ research_done: true }).eq("id", segment.id);

  let inserted = 0;
  if (rows.length > 0) {
    const { error } = await supabase.from("companies").insert(rows);
    if (error) {
      const message = /schema cache|does not exist/.test(error.message)
        ? "companiesテーブルに新しい列がありません。マイグレーション 00006_company_research.sql を適用してください"
        : error.message;
      throw new Error(message);
    }
    inserted = rows.length;
  }

  return { found: candidates.length, inserted, duplicates, cost_usd: costUsd };
}
