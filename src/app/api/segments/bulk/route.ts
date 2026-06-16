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

  // SELECTは既定で最大1000行のため、特化先項目・既存セグメントは全件ページングで取得する。
  // ページ境界で行が重複・欠落しないよう、必ずユニーク列(id)で安定ソートする
  // (created_atが同一の大量行をオフセットページングすると順序が不定になり重複取得される)
  let items: { id: string; name: string }[];
  let existing: { industry_id: string }[];
  try {
    items = await fetchAllRows<{ id: string; name: string }>(() =>
      supabase
        .from("industries")
        .select("id, name")
        .eq("database_id", body.database_id)
        .order("id")
    );
    existing = await fetchAllRows<{ industry_id: string }>(() =>
      supabase
        .from("segments")
        .select("industry_id")
        .eq("business_model_id", body.business_model_id)
        .order("industry_id")
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

  // industry_idで重複排除(ページング重複や同一項目の保険)
  const seen = new Set<string>();
  const rows = items
    .filter((item) => {
      if (existingIndustryIds.has(item.id) || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .map((item) => ({
      business_model_id: body.business_model_id,
      industry_id: item.id,
      name: `${item.name}${bm.name}`,
    }));

  if (rows.length === 0) {
    return NextResponse.json({ inserted: 0, skipped: items.length });
  }

  // 大量行をまとめて送ると失敗しうるため1000件ずつに分割。
  // 競合(既存行)が混ざってもエラーにしないようupsert+ignoreDuplicatesにする
  const chunkSize = 1000;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const { error } = await supabase
      .from("segments")
      .upsert(rows.slice(i, i + chunkSize), {
        onConflict: "business_model_id,industry_id",
        ignoreDuplicates: true,
      });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    inserted: rows.length,
    skipped: items.length - rows.length,
  });
}
