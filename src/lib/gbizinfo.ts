// gBizINFO REST API クライアント
// https://info.gbiz.go.jp/hojin/swagger-ui/index.html
// トークンは https://info.gbiz.go.jp/hojin/api_registration/form で申請

const BASE_URL = "https://info.gbiz.go.jp/hojin/v1/hojin";

export type GbizSearchParams = {
  business_item?: string; // 業種コード
  prefecture?: string; // JIS都道府県コード2桁(例: 東京都=13)
  employee_number_from?: string;
  employee_number_to?: string;
  capital_stock_from?: string;
  capital_stock_to?: string;
  page?: number;
};

export type GbizCompany = {
  corporate_number: string;
  name: string;
  location: string | null;
  employee_number: number | null;
  capital_stock: number | null;
  company_url: string | null;
};

type GbizApiRow = {
  corporate_number?: string;
  name?: string;
  location?: string;
  employee_number?: string | number;
  capital_stock?: string | number;
  company_url?: string;
};

function toNumber(v: string | number | undefined): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export function gbizCompanyPageUrl(corporateNumber: string): string {
  return `https://info.gbiz.go.jp/hojin/ichiran?hojinBango=${corporateNumber}`;
}

export async function searchGbizCompanies(
  params: GbizSearchParams
): Promise<GbizCompany[]> {
  const token = process.env.GBIZINFO_API_TOKEN;
  if (!token) {
    throw new Error("GBIZINFO_API_TOKEN が設定されていません");
  }

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  }

  const res = await fetch(`${BASE_URL}?${query.toString()}`, {
    headers: { "X-hojinInfo-api-token": token },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`gBizINFO APIエラー: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const rows: GbizApiRow[] = data["hojin-infos"] ?? [];
  return rows
    .filter((r) => r.corporate_number && r.name)
    .map((r) => ({
      corporate_number: r.corporate_number!,
      name: r.name!,
      location: r.location ?? null,
      employee_number: toNumber(r.employee_number),
      capital_stock: toNumber(r.capital_stock),
      company_url: r.company_url ?? null,
    }));
}
