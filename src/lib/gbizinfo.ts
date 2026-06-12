// gBizINFO REST API クライアント(経済産業省・無料)
// トークン申請: https://info.gbiz.go.jp/hojin/api_registration/form
// 社名検索で法人番号・従業員数・資本金が取得できる

const BASE_URL = "https://info.gbiz.go.jp/hojin/v1/hojin";

export type GbizCompany = {
  corporate_number: string;
  name: string;
  location: string | null;
  employee_number: number | null;
  capital_stock: number | null;
};

function toNumber(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

export async function searchGbizByName(name: string): Promise<GbizCompany[]> {
  const token = process.env.GBIZINFO_API_TOKEN;
  if (!token) {
    throw new Error(
      "GBIZINFO_API_TOKEN が設定されていません。https://info.gbiz.go.jp/hojin/api_registration/form で無料トークンを申請し、Vercelの環境変数に設定してください"
    );
  }
  const query = new URLSearchParams({ name, limit: "10" });
  const res = await fetch(`${BASE_URL}?${query.toString()}`, {
    headers: { "X-hojinInfo-api-token": token },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  // gBizINFOは検索結果0件のとき404を返す仕様
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(`gBizINFO APIエラー: ${res.status}`);
  }
  const data = await res.json();
  const rows: Record<string, unknown>[] = data["hojin-infos"] ?? [];
  return rows
    .filter((r) => r.corporate_number && r.name)
    .map((r) => ({
      corporate_number: String(r.corporate_number),
      name: String(r.name),
      location: r.location ? String(r.location) : null,
      employee_number: toNumber(r.employee_number),
      capital_stock: toNumber(r.capital_stock),
    }));
}

// 半角英数字を全角に変換(法人登記名は「アクシスITパートナーズ」のように全角英字が多い)
export function toFullWidthAscii(text: string): string {
  return text.replace(/[A-Za-z0-9]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0xfee0)
  );
}

// 会社名の表記ゆれを吸収して比較するための正規化
// NFKCで全角英数⇄半角の差を吸収する(IT と IT を同一視)
export function normalizeCompanyName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/株式会社|有限会社|合同会社|合資会社|合名会社/g, "")
    .replace(/\(株\)|\(有\)/g, "")
    .replace(/[\s　・]/g, "")
    .toLowerCase();
}

// 法人格表記や空白を除いた検索用のコア名(部分一致検索のヒット率を上げる)
export function coreCompanyName(name: string): string {
  return name
    .replace(/株式会社|有限会社|合同会社|合資会社|合名会社/g, "")
    .replace(/\(株\)|\（株\）|\(有\)|\（有\）/g, "")
    .replace(/[\s　]/g, "")
    .trim();
}

// 表記ゆれに強い検索: 元の名前 → 全角英数版 → コア名 → 全角コア名 の順で試し、
// 最初にヒットした結果を返す
export async function searchGbizByNameFlexible(
  name: string
): Promise<GbizCompany[]> {
  const core = coreCompanyName(name);
  const queries = [...new Set([name, toFullWidthAscii(name), core, toFullWidthAscii(core)])].filter(Boolean);

  for (let i = 0; i < queries.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 300));
    const results = await searchGbizByName(queries[i]);
    if (results.length > 0) return results;
  }
  return [];
}
