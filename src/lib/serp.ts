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
