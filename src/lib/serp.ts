// SERP取得クライアント。SerpAPI または DataforSEO に対応(環境変数で切り替え)。
// SERP_PROVIDER=dataforseo でDataforSEO、未設定/serpapi でSerpAPIを使う。
// 別のSERP取得システムに差し替える場合もこの関数群だけ置き換えればよい。

export type SerpResultRow = {
  position: number;
  url: string;
  title: string | null;
  snippet: string | null;
};

// 現在のSERPプロバイダ("serpapi" | "dataforseo")。コスト集計の単価切り替えにも使う
export function serpProvider(): "serpapi" | "dataforseo" {
  return process.env.SERP_PROVIDER?.toLowerCase() === "dataforseo"
    ? "dataforseo"
    : "serpapi";
}

// 現在のプロバイダの認証情報が設定済みか。未設定ならその旨のメッセージを返す
export function serpConfigError(): string | null {
  if (serpProvider() === "dataforseo") {
    return process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD
      ? null
      : "DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD が設定されていません";
  }
  return process.env.SERPAPI_KEY ? null : "SERPAPI_KEY が設定されていません";
}

export async function fetchSerpResults(
  keyword: string,
  depth: number,
  device: string
): Promise<SerpResultRow[]> {
  return serpProvider() === "dataforseo"
    ? fetchDataforSeoResults(keyword, depth, device)
    : fetchSerpApiResults(keyword, depth, device);
}

// --- SerpAPI (serpapi.com) ---
async function fetchSerpApiResults(
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
    signal: AbortSignal.timeout(30000),
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

// --- DataforSEO (dataforseo.com) Google Organic Live Advanced ---
// 認証: Basic認証(login:password)。日本のGoogle(location_code=2392, language=ja)
async function fetchDataforSeoResults(
  keyword: string,
  depth: number,
  device: string
): Promise<SerpResultRow[]> {
  const login = process.env.DATAFORSEO_LOGIN?.trim();
  const password = process.env.DATAFORSEO_PASSWORD?.trim();
  if (!login || !password) {
    throw new Error("DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD が設定されていません");
  }
  const auth = Buffer.from(`${login}:${password}`).toString("base64");

  const res = await fetch(
    "https://api.dataforseo.com/v3/serp/google/organic/live/advanced",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify([
        {
          keyword,
          language_code: "ja",
          location_code: 2392, // Japan
          device: device === "mobile" ? "mobile" : "desktop",
          depth: Math.min(depth, 100),
        },
      ]),
    }
  );
  if (!res.ok) {
    throw new Error(`SERP APIエラー: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  // 全体のstatusとタスク単位のstatusを確認(課金エラー等はここに出る)
  const task = data?.tasks?.[0];
  if (data?.status_code !== 20000 || !task || task.status_code !== 20000) {
    const msg = task?.status_message ?? data?.status_message ?? "unknown error";
    const code = task?.status_code ?? data?.status_code;
    throw new Error(`SERP APIエラー: ${code} ${msg}`);
  }
  const items: {
    type?: string;
    rank_absolute?: number;
    url?: string;
    title?: string;
    description?: string;
  }[] = task.result?.[0]?.items ?? [];
  return items
    .filter((r) => r.type === "organic" && r.rank_absolute && r.url)
    .slice(0, depth)
    .map((r) => ({
      position: r.rank_absolute!,
      url: r.url!,
      title: r.title ?? null,
      snippet: r.description ?? null,
    }));
}

export function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

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

// ページHTMLを取得する。ボット風UAはWAFに弾かれるためブラウザ同等のヘッダーを使う
export async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ja,en-US;q=0.8",
      },
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

// サイトのhome(トップ)から、事業内容の判定に使う代表的なテキストを抜き出す。
// title全文 / 最初のh1 / meta description(無ければog:description)。
export type HomeSignals = {
  title: string | null;
  h1: string | null;
  description: string | null;
};

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function metaContent(html: string, attr: string, value: string): string | null {
  // <meta name="description" content="..."> / <meta content="..." name="description"> 両順序に対応
  const re1 = new RegExp(
    `<meta[^>]*${attr}=["']${value}["'][^>]*content=["']([^"']*)["']`,
    "i"
  );
  const re2 = new RegExp(
    `<meta[^>]*content=["']([^"']*)["'][^>]*${attr}=["']${value}["']`,
    "i"
  );
  const m = html.match(re1) ?? html.match(re2);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

export function extractHomeSignals(html: string): HomeSignals {
  const titleM = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleM ? titleM[1].replace(/\s+/g, " ").trim().slice(0, 120) : null;
  const h1M = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const h1 = h1M ? stripTags(h1M[1]).slice(0, 120) || null : null;
  const description =
    (metaContent(html, "name", "description") ??
      metaContent(html, "property", "og:description"))?.slice(0, 200) ?? null;
  return { title, h1, description };
}

// 全角数字・各種ハイフン・括弧を半角へ寄せる(電話番号抽出の前処理)
function normalizePhoneChars(s: string): string {
  return s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[‐‑‒–—―ー−ｰ－]/g, "-")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")");
}

// 数字10〜11桁(先頭0)の電話番号らしさを検証し、整形して返す
function cleanJpPhone(raw: string): string | null {
  let digits = raw.replace(/[^\d+]/g, "");
  digits = digits.replace(/^\+?81/, "0").replace(/\D/g, "");
  if (!/^0\d{9,10}$/.test(digits)) return null;
  // 区切りが分からないので元の表記(ハイフンのみ残す)を優先、整合しなければ数字のみ
  const formatted = raw
    .replace(/[^\d-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return formatted.replace(/\D/g, "") === digits ? formatted : digits;
}

// ページHTMLから代表電話番号を抽出する。
// 優先順: tel:リンク > header/footer内のTEL表記 > その他の電話番号表記。
// FAX番号や本文中の無関係な番号を拾わないよう、文脈とエリアでスコアリングする。
export function extractPhoneNumber(html: string): string | null {
  const norm = normalizePhoneChars(html);

  // 1. tel:リンクが最も信頼できる(複数あれば最頻出を採用)
  const telCounts = new Map<string, number>();
  for (const m of norm.matchAll(/href=["']tel:([+\d() \-]+)["']/gi)) {
    const phone = cleanJpPhone(m[1]);
    if (phone) telCounts.set(phone, (telCounts.get(phone) ?? 0) + 1);
  }
  if (telCounts.size > 0) {
    return [...telCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  // 2. テキスト中の電話番号を文脈・エリアでスコアリング
  const headerText = (norm.match(/<header[\s\S]*?<\/header>/gi) ?? [])
    .join(" ")
    .replace(/<[^>]+>/g, " ");
  const footerText = (norm.match(/<footer[\s\S]*?<\/footer>/gi) ?? [])
    .join(" ")
    .replace(/<[^>]+>/g, " ");
  const text = norm.replace(/<[^>]+>/g, " ");

  // 固定電話・携帯・フリーダイヤル(区切りありを必須にして誤検出を抑える)
  const phoneRe =
    /0\d{1,4}[-(]\d{1,4}[-) ]\d{3,4}|0(?:120|800)-?\d{2,4}-?\d{2,4}/g;
  let bestPhone: string | null = null;
  let bestScore = -Infinity;
  for (const m of text.matchAll(phoneRe)) {
    const raw = m[0];
    const phone = cleanJpPhone(raw);
    if (!phone) continue;
    const idx = m.index ?? 0;
    const ctx = text.slice(Math.max(0, idx - 24), idx + raw.length + 4);
    let score = 0;
    if (/FAX|ＦＡＸ/i.test(ctx)) score -= 8;
    if (/TEL|電話|お問い?合わせ|フリーダイヤル|受付|ご相談|代表/i.test(ctx)) score += 4;
    if (headerText.includes(raw)) score += 3;
    if (footerText.includes(raw)) score += 2;
    if (/^0(?:120|800)/.test(phone)) score += 1; // フリーダイヤルは代表番号の可能性が高い
    if (score > bestScore) {
      bestScore = score;
      bestPhone = phone;
    }
  }
  // FAXしか見つからない等、スコアが負なら採用しない
  return bestScore >= 0 ? bestPhone : null;
}
