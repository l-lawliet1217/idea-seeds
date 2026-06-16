import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase-server";
import {
  extractCompanyNames,
  judgeSiteRelevance,
} from "@/lib/claude";
import {
  collectCompanyEvidence,
  extractDomain,
  extractHomeSignals,
  extractPhoneNumber,
  extractSiteTitle,
  fetchHtml,
  fetchSerpResults,
  findCompanyInfoLinks,
} from "@/lib/serp";
import { extractUsage, logApiUsage, logSerpUsage } from "@/lib/usage";
import { normalizeCompanyName } from "@/lib/gbizinfo";

export type ResearchSegment = { id: string; name: string };

export type RecheckCompany = {
  id: string;
  name: string;
  service_name: string | null;
  service_url: string | null;
  website_url: string | null;
  segment_name: string | null;
};

// 既存の登録済み候補を home(ルート)の h1/description で再判定し、
// その事業を実際に運営していないと判断したら status='excluded'(対象外)にする。
// home が取得できない/判定材料が無い場合は安全側で残す(誤除外を避ける)。
export async function recheckCompany(
  supabase: SupabaseClient,
  company: RecheckCompany
): Promise<{ excluded: boolean; cost: number }> {
  const finish = async (patch: Record<string, unknown>) => {
    await supabase
      .from("companies")
      .update({
        relevance_checked: true,
        updated_at: new Date().toISOString(),
        ...patch,
      })
      .eq("id", company.id);
  };

  const url = company.service_url ?? company.website_url;
  if (!url || !company.segment_name) {
    await finish({});
    return { excluded: false, cost: 0 };
  }

  let signals: { title: string | null; h1: string | null; description: string | null } | null =
    null;
  try {
    const origin = new URL(url).origin;
    const html = await fetchHtml(origin);
    if (html) signals = extractHomeSignals(html);
  } catch {
    signals = null;
  }
  if (!signals) {
    await finish({}); // homeが取れないものは残す
    return { excluded: false, cost: 0 };
  }

  const judged = await judgeSiteRelevance(company.segment_name, [
    {
      title: company.service_name ?? company.name,
      url,
      home_title: signals.title,
      home_h1: signals.h1,
      home_description: signals.description,
    },
  ]);
  const cost = await logApiUsage(
    "recheck",
    "claude-haiku-4-5",
    extractUsage(judged.usage),
    { company_id: company.id, company: company.name }
  );

  const keep = judged.indices.includes(0);
  if (!keep) {
    await finish({ status: "excluded", note: "home再判定で対象外(事業実在性なし)" });
  } else {
    await finish({});
  }
  return { excluded: !keep, cost };
}

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

  // 2. 各候補のhome(ルート)を取得し、title/h1/descriptionで「本当にその事業を運営しているか」を判定。
  //    検索結果の下層ページのタイトルだけ一致している誤検出(自社採用ページ等)を弾く。
  let picked = candidates;
  if (candidates.length > 0) {
    const homeSignals = await Promise.all(
      candidates.map(async (c) => {
        try {
          const origin = new URL(c.url).origin;
          const html = await fetchHtml(origin);
          return html ? extractHomeSignals(html) : null;
        } catch {
          return null;
        }
      })
    );
    const judged = await judgeSiteRelevance(
      segment.name,
      candidates.map((c, i) => ({
        title: c.title,
        url: c.url,
        home_title: homeSignals[i]?.title ?? null,
        home_h1: homeSignals[i]?.h1 ?? null,
        home_description: homeSignals[i]?.description ?? null,
      }))
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
