import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { friendlyClaudeError, judgeSiteRelevance } from "@/lib/claude";
import {
  extractCompanyName,
  extractDomain,
  extractSiteTitle,
  fetchSerpResults,
} from "@/lib/serp";
import { extractUsage, logApiUsage } from "@/lib/usage";

export const maxDuration = 120;

// 高速リサーチ:
// 1. セグメント名でGoogle検索(SerpAPI)→上位5件
// 2. 該当しそうなサイトだけHaiku(軽量)で選別
// 3. 採用サイトのHTMLからサービス名(title)と運営会社名(フッター)を抽出して登録
export async function POST(req: Request) {
  const body = await req.json();
  if (!body.segment_id) {
    return NextResponse.json({ error: "segment_id は必須です" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: segment, error: segmentError } = await supabase
    .from("segments")
    .select("id, name")
    .eq("id", body.segment_id)
    .single();
  if (segmentError || !segment) {
    return NextResponse.json({ error: "セグメントが見つかりません" }, { status: 404 });
  }

  if (!process.env.SERPAPI_KEY) {
    return NextResponse.json(
      {
        error:
          "SERPAPI_KEY が設定されていません。https://serpapi.com/ でキーを取得し(無料枠あり)、Vercelの環境変数に設定してください",
      },
      { status: 503 }
    );
  }

  try {
    // 1. Google検索の上位5件
    const serp = await fetchSerpResults(segment.name, 5, "desktop");
    if (serp.length === 0) {
      await supabase
        .from("segments")
        .update({ research_done: true })
        .eq("id", segment.id);
      return NextResponse.json({
        segment: segment.name,
        found: 0,
        inserted: 0,
        cost_usd: 0,
      });
    }

    // 既存企業とドメイン重複するものは候補から外す
    const { data: existing } = await supabase
      .from("companies")
      .select("service_url, website_url");
    const existingDomains = new Set(
      (existing ?? [])
        .flatMap((row) => [row.service_url, row.website_url])
        .map((u) => (u ? extractDomain(u) : null))
        .filter(Boolean)
    );
    const seen = new Set<string>();
    const candidates = serp.filter((r) => {
      const domain = extractDomain(r.url);
      if (!domain || existingDomains.has(domain) || seen.has(domain)) return false;
      seen.add(domain);
      return true;
    });

    // 2. 該当しそうなサイトをHaikuで選別(数百トークンの軽い呼び出し)
    let picked = candidates;
    let costUsd = 0;
    if (candidates.length > 0) {
      const judged = await judgeSiteRelevance(
        segment.name,
        candidates.map((c) => ({ title: c.title, url: c.url }))
      );
      costUsd = await logApiUsage(
        "research_fast",
        "claude-haiku-4-5",
        extractUsage(judged.usage),
        { segment_id: segment.id, segment: segment.name }
      );
      picked = judged.indices.map((i) => candidates[i]).slice(0, 3);
    }

    // 3. 各サイトのHTMLからサービス名と運営会社名を抽出(並列・無料)
    const now = new Date().toISOString();
    const rows = (
      await Promise.all(
        picked.map(async (site) => {
          let serviceName = site.title;
          let companyName: string | null = null;
          try {
            const res = await fetch(site.url, {
              headers: { "User-Agent": "Mozilla/5.0 (compatible; AirERP/1.0)" },
              signal: AbortSignal.timeout(10000),
              cache: "no-store",
            });
            if (res.ok) {
              const html = await res.text();
              serviceName = extractSiteTitle(html) ?? site.title;
              companyName = extractCompanyName(html);
            }
          } catch {
            // 取得失敗時は検索結果のタイトルだけで登録
          }
          return {
            segment_id: segment.id,
            name: companyName ?? `${serviceName ?? site.url} 運営会社(未特定)`,
            service_name: serviceName,
            service_url: site.url,
            website_url: site.url,
            status: "candidate",
            source: "serp_research",
            source_url: site.url,
            collected_at: now,
          };
        })
      )
    ).filter(Boolean);

    // 調査が完了したセグメントは収集済みフラグを立てる
    await supabase
      .from("segments")
      .update({ research_done: true })
      .eq("id", segment.id);

    let inserted = 0;
    if (rows.length > 0) {
      const { error } = await supabase.from("companies").insert(rows);
      if (error) {
        const message = /schema cache|does not exist/.test(error.message)
          ? "companiesテーブルに新しい列がありません。マイグレーション 00006_company_research.sql をSupabaseのSQL Editorで実行してください(/setup で適用状況を確認できます)"
          : error.message;
        return NextResponse.json({ error: message }, { status: 500 });
      }
      inserted = rows.length;
    }

    return NextResponse.json({
      segment: segment.name,
      found: candidates.length,
      inserted,
      skipped: candidates.length - inserted,
      cost_usd: costUsd,
    });
  } catch (err) {
    return NextResponse.json({ error: friendlyClaudeError(err) }, { status: 500 });
  }
}
