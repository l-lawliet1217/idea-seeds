// SERP取得クライアント。現状はSerpAPI(serpapi.com)実装。
// 既存の自社SERP取得システムに差し替える場合はこの関数の中身だけ置き換える。

export type SerpResultRow = {
  position: number;
  url: string;
  title: string | null;
  snippet: string | null;
};

export async function fetchSerpResults(
  keyword: string,
  depth: number,
  device: string
): Promise<SerpResultRow[]> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    throw new Error("SERPAPI_KEY が設定されていません");
  }

  const params = new URLSearchParams({
    engine: "google",
    q: keyword,
    num: String(Math.min(depth, 100)),
    hl: "ja",
    gl: "jp",
    device: device === "mobile" ? "mobile" : "desktop",
    api_key: apiKey,
  });

  const res = await fetch(`https://serpapi.com/search.json?${params}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`SERP APIエラー: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const organic: {
    position?: number;
    link?: string;
    title?: string;
    snippet?: string;
  }[] = data.organic_results ?? [];
  return organic
    .filter((r) => r.position && r.link)
    .slice(0, depth)
    .map((r) => ({
      position: r.position!,
      url: r.link!,
      title: r.title ?? null,
      snippet: r.snippet ?? null,
    }));
}

export function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&copy;/gi, "©")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ");
}

// ページHTMLから運営会社名の手がかりを集める。
// scope="footer": トップページ用。<footer>タグ(なければ末尾20%)とコピーライト行・
//   「運営会社」表記の周辺のみを対象にする。本文中の取引先・掲載企業名(求人サイトの
//   求人広告内の社名など)を拾わないための制限。
// scope="full": 会社概要・運営会社・特商法ページ用。ページ全体を対象。
export function collectCompanyEvidence(
  html: string,
  scope: "footer" | "full"
): string[] {
  const fullText = htmlToText(html);
  let target = fullText;
  if (scope === "footer") {
    const footerHtml = (html.match(/<footer[\s\S]*?<\/footer>/gi) ?? []).join(" ");
    target = footerHtml
      ? htmlToText(footerHtml)
      : fullText.slice(Math.floor(fullText.length * 0.8));
  }

  const out = new Set<string>();
  // コピーライト行(実質フッター)と「運営会社」表記はページ全体から拾ってよい
  for (const m of fullText.match(/(?:©|Copyright)[^©]{0,100}/gi) ?? []) {
    out.add(`[copyright] ${m.trim().slice(0, 120)}`);
  }
  for (const m of fullText.match(/運営(?:会社|者|元)[^。]{0,80}/g) ?? []) {
    out.add(`[運営会社表記] ${m.trim().slice(0, 120)}`);
  }
  // 社名パターンの走査は対象範囲(フッター or 全体)に限定
  const namePattern =
    /(?:株式会社|有限会社|合同会社)\s?[^\s、。<>"';:()()]{1,30}|[^\s、。<>"';:()()]{1,30}(?:株式会社|有限会社|合同会社)/g;
  for (const m of target.match(namePattern) ?? []) {
    out.add(`[${scope === "footer" ? "フッター" : "会社情報ページ"}] ${m.trim().slice(0, 60)}`);
    if (out.size >= 10) break;
  }
  return [...out].slice(0, 10);
}

// 会社概要・運営会社・特定商取引法ページへのリンクを探す(スコア順に最大3件)
// ラベル一致(日英)を最優先し、hrefの手がかりは補助。無関係なページは減点して除外する
export function findCompanyInfoLinks(html: string, baseUrl: string): string[] {
  const strongLabel =
    /会社概要|会社案内|運営会社|会社情報|企業情報|運営者|運営元|特定商取引|コーポレート|about\s*us|company\s*(?:profile|info|outline)?|corporate/i;
  const hrefHint =
    /company|corporate|about|profile|tokutei|kaisya|kaisha|outline|operator|unei|gaiyou?/i;
  const hrefNoise =
    /news|blog|column|faq|help|recruit|privacy|terms|policy|contact|login|entry|career|sitemap/i;

  const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,400}?)<\/a>/gi;
  const best = new Map<string, number>();
  let m: RegExpExecArray | null;
  let scanned = 0;
  while ((m = re.exec(html)) !== null && scanned < 300) {
    scanned++;
    const href = m[1];
    const inner = m[2]; // alt/title属性のラベルも拾うため内側HTMLをそのまま判定
    let score = 0;
    if (strongLabel.test(inner)) score += 10;
    if (hrefHint.test(href)) score += 3;
    if (hrefNoise.test(href)) score -= 6;
    if (score <= 0) continue;
    try {
      const url = new URL(href, baseUrl).toString();
      best.set(url, Math.max(best.get(url) ?? -Infinity, score));
    } catch {
      // 不正なURLはスキップ
    }
  }
  return [...best.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([url]) => url);
}

// <title> からサービス名を取り出す(区切り文字以降のキャッチコピーは落とす)
export function extractSiteTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  const title = m[1].replace(/\s+/g, " ").trim();
  const head = title.split(/[|｜\-–—«»<>【]/)[0].trim();
  return (head || title).slice(0, 60) || null;
}
