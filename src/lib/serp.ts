// SERP取得クライアント。現状はSerpAPI(serpapi.com)実装。
// 既存の自社SERP取得システムに差し替える場合はこの関数の中身だけ置き換える。

export type SerpResultRow = {
  position: number;
  url: string;
  title: string | null;
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
  const organic: { position?: number; link?: string; title?: string }[] =
    data.organic_results ?? [];
  return organic
    .filter((r) => r.position && r.link)
    .slice(0, depth)
    .map((r) => ({
      position: r.position!,
      url: r.link!,
      title: r.title ?? null,
    }));
}

export function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// ページHTMLから運営会社名らしき文字列を抽出する(コピーライト行を優先)
export function extractCompanyName(html: string): string | null {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/&copy;/gi, "©")
    .replace(/&amp;/gi, "&");

  const companyPattern =
    /(?:株式会社|有限会社|合同会社)[゠-ヿ぀-ゟ一-鿿Ａ-ｚA-Za-z0-9&．.・ー\-]{1,30}|[゠-ヿ぀-ゟ一-鿿Ａ-ｚA-Za-z0-9&．.・ー\-]{1,30}(?:株式会社|有限会社|合同会社)/g;

  // 1. コピーライト行の近くを優先(運営会社である可能性が高い)
  const copyrightLines = text.match(/(?:©|Copyright)[^<\n]{0,120}/gi) ?? [];
  for (const line of copyrightLines) {
    const m = line.match(companyPattern);
    if (m) return m[0].trim();
  }
  // 2. ページ後半(フッター付近)から探す
  const tail = text.slice(Math.floor(text.length * 0.6));
  const tailMatch = tail.match(companyPattern);
  if (tailMatch) return tailMatch[0].trim();
  // 3. ページ全体の最初の一致
  const anyMatch = text.match(companyPattern);
  return anyMatch ? anyMatch[0].trim() : null;
}

// <title> からサービス名を取り出す(区切り文字以降のキャッチコピーは落とす)
export function extractSiteTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  const title = m[1].replace(/\s+/g, " ").trim();
  const head = title.split(/[|｜\-–—«»<>【]/)[0].trim();
  return (head || title).slice(0, 60) || null;
}
