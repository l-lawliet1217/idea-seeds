import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import {
  extractCompanyNames,
  friendlyClaudeError,
  judgeSiteRelevance,
} from "@/lib/claude";
import {
  collectCompanyEvidence,
  extractDomain,
  extractSiteTitle,
  fetchSerpResults,
  findCompanyInfoLinks,
} from "@/lib/serp";
import { extractUsage, logApiUsage } from "@/lib/usage";
import { normalizeCompanyName } from "@/lib/gbizinfo";

// 文字コードを判定してデコードする(Shift_JIS/EUC-JPの古いサイト対策)
function decodeHtml(buf: ArrayBuffer, contentType: string | null): string {
  const bytes = new Uint8Array(buf);
  let charset =
    contentType?.match(/charset=["']?([\w\-]+)/i)?.[1]?.toLowerCase() ?? null;
  if (!charset) {
    // metaタグから判定(先頭4KBをASCII互換で読む)
    const head = new TextDecoder("latin1").decode(bytes.slice(0, 4096));
    charset =
      head.match(/<meta[^>]+charset=["']?([\w\-]+)/i)?.[1]?.toLowerCase() ?? null;
  }
  const label = /^(shift[_\-]?jis|sjis|x-sjis|windows-31j|ms932)$/.test(charset ?? "")
    ? "shift_jis"
    : charset === "euc-jp"
      ? "euc-jp"
      : (charset ?? "utf-8");
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AirERP/1.0)" },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return decodeHtml(buf, res.headers.get("content-type"));
  } catch {
    return null;
  }
}

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

    // 既存企業とドメイン重複するものは候補から外す(社名重複は登録時に判定)
    const { data: existing } = await supabase
      .from("companies")
      .select("name, service_url, website_url");
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

    // 3. 各サイトのフッターと会社情報ページから運営会社名の証拠を収集(並列・無料)
    const siteData = await Promise.all(
      picked.map(async (site, index) => {
        let serviceName = site.title;
        const evidence: string[] = [];
        const html = await fetchHtml(site.url);
        if (html) {
          serviceName = extractSiteTitle(html) ?? site.title;
          // トップページはフッター限定(本文中の取引先・掲載企業名を拾わない)
          evidence.push(...collectCompanyEvidence(html, "footer"));
          // 会社概要・運営会社・特商法ページがあればそちらも読む。
          // リンクが見つからない場合(JS描画のフッター等)は定番パスを直接試す
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
            }
          }
        }
        return { index, url: site.url, service_name: serviceName, evidence };
      })
    );

    // 4. 証拠から正式社名だけをHaikuで切り出す(助詞混入・本文社名の誤採用を防ぐ)
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

    // 特定できなかった場合は空欄で登録(後からgBizINFOや手動で補完)
    // 同一運営会社の重複登録を防ぐ: 既存企業・同一バッチ内で正規化社名が一致したらスキップ
    // (例: コーポレートサイトとサービスサイトでドメインが違っても同じ会社)
    const existingNames = new Set(
      (existing ?? [])
        .map((row) => (row.name ? normalizeCompanyName(row.name) : null))
        .filter((n): n is string => !!n)
    );
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
      rows.push({
        segment_id: segment.id,
        name: companyName,
        service_name: site.service_name,
        service_url: site.url,
        website_url: site.url,
        status: "candidate",
        source: "serp_research",
        source_url: site.url,
        collected_at: now,
      });
    }

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
      duplicates,
      skipped: candidates.length - inserted,
      cost_usd: costUsd,
    });
  } catch (err) {
    return NextResponse.json({ error: friendlyClaudeError(err) }, { status: 500 });
  }
}
