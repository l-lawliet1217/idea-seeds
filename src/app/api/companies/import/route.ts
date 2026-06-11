import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import {
  searchGbizCompanies,
  gbizCompanyPageUrl,
  GbizSearchParams,
} from "@/lib/gbizinfo";
import { ImportCandidate } from "@/types";

const MAX_PAGES = 5;
const CHUNK_SIZE = 50;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractPrefecture(location: string | null): string | null {
  if (!location) return null;
  const m = location.match(/^(.{2,3}?[都道府県])/);
  return m ? m[1] : null;
}

export async function POST(req: Request) {
  const body = await req.json();
  const segmentId: string | undefined = body.segment_id;
  const dryRun: boolean = body.dry_run !== false;
  const search: GbizSearchParams = body.search ?? {};
  const pages = Math.min(Math.max(Number(body.pages) || 1, 1), MAX_PAGES);

  if (!segmentId) {
    return NextResponse.json({ error: "segment_id は必須です" }, { status: 400 });
  }

  // gBizINFO検索(レート制限対策で1秒間隔)
  const found = new Map<string, ImportCandidate>();
  try {
    for (let page = 1; page <= pages; page++) {
      const rows = await searchGbizCompanies({ ...search, page });
      for (const r of rows) {
        found.set(r.corporate_number, {
          corporate_number: r.corporate_number,
          name: r.name,
          prefecture: extractPrefecture(r.location),
          employees: r.employee_number,
          website_url: r.company_url,
        });
      }
      if (rows.length === 0) break;
      if (page < pages) await sleep(1000);
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "gBizINFO検索に失敗しました" },
      { status: 502 }
    );
  }

  // 既存企業(法人番号)との重複を除外
  const supabase = getSupabaseAdmin();
  const numbers = [...found.keys()];
  let duplicates = 0;
  if (numbers.length > 0) {
    const { data: existing, error } = await supabase
      .from("companies")
      .select("corporate_number")
      .in("corporate_number", numbers);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const row of existing ?? []) {
      if (found.delete(row.corporate_number)) duplicates++;
    }
  }

  const candidates = [...found.values()];
  if (dryRun) {
    return NextResponse.json({ candidates, duplicates });
  }

  // 取り込み実行
  const now = new Date().toISOString();
  const rows = candidates.map((c) => ({
    segment_id: segmentId,
    corporate_number: c.corporate_number,
    name: c.name,
    website_url: c.website_url,
    prefecture: c.prefecture,
    employees: c.employees,
    status: "candidate",
    source: "gbizinfo",
    source_url: gbizCompanyPageUrl(c.corporate_number),
    collected_at: now,
  }));

  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from("companies").insert(chunk);
    if (error) {
      return NextResponse.json(
        { error: error.message, inserted },
        { status: 500 }
      );
    }
    inserted += chunk.length;
  }

  return NextResponse.json({ inserted, duplicates });
}
