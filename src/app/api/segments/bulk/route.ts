import { NextResponse } from "next/server";
import { getSupabaseAdmin, fetchAllRows } from "@/lib/supabase-server";

// データベース×ビジネスモデルから全項目分のセグメントを一括生成する
// 例: 都道府県 × 特化型Eコマース → 北海道特化型Eコマース, 青森特化型Eコマース, ...
export async function POST(req: Request) {
  const body = await req.json();
  if (!body.business_model_id || !body.database_id) {
    return NextResponse.json(
      { error: "business_model_id と database_id は必須です" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  const { data: bm, error: bmError } = await supabase
    .from("business_models")
    .select("name")
    .eq("id", body.business_model_id)
    .single();
  if (bmError || !bm) {
    return NextResponse.json({ error: "ビジネスモデルが見つかりません" }, { status: 404 });
  }

  // SELECTは既定で最大1000行のため、特化先項目・既存セグメントは全件ページングで取得する
  let items: { id: string; name: string }[];
  let existing: { industry_id: string }[];
  try {
    items = await fetchAllRows<{ id: string; name: string }>(() =>
      supabase
        .from("industries")
        .select("id, name")
        .eq("database_id", body.database_id)
        .order("created_at")
    );
    existing = await fetchAllRows<{ industry_id: string }>(() =>
      supabase
        .from("segments")
        .select("industry_id")
        .eq("business_model_id", body.business_model_id)
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (items.length === 0) {
    return NextResponse.json(
      { error: "このデータベースに特化先項目がありません" },
      { status: 400 }
    );
  }
  const existingIndustryIds = new Set(existing.map((row) => row.industry_id));

  const rows = items
    .filter((item) => !existingIndustryIds.has(item.id))
    .map((item) => ({
      business_model_id: body.business_model_id,
      industry_id: item.id,
      name: `${item.name}${bm.name}`,
    }));

  if (rows.length === 0) {
    return NextResponse.json({ inserted: 0, skipped: items.length });
  }

  // INSERTも大量行をまとめて送ると失敗しうるため、1000件ずつに分割する
  const chunkSize = 1000;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const { error } = await supabase
      .from("segments")
      .insert(rows.slice(i, i + chunkSize));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    inserted: rows.length,
    skipped: items.length - rows.length,
  });
}
