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

// 会社名の表記ゆれを吸収して比較するための正規化
export function normalizeCompanyName(name: string): string {
  return name
    .replace(/株式会社|有限会社|合同会社|合資会社|合名会社/g, "")
    .replace(/\(株\)|\（株\）|\(有\)|\（有\）/g, "")
    .replace(/[\s　]/g, "")
    .toLowerCase();
}
