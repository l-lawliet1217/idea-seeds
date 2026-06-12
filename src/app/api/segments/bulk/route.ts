import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

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
  const [bmRes, itemsRes, existingRes] = await Promise.all([
    supabase
      .from("business_models")
      .select("name")
      .eq("id", body.business_model_id)
      .single(),
    supabase
      .from("industries")
      .select("id, name")
      .eq("database_id", body.database_id)
      .order("created_at"),
    supabase
      .from("segments")
      .select("industry_id")
      .eq("business_model_id", body.business_model_id),
  ]);

  if (bmRes.error || !bmRes.data) {
    return NextResponse.json({ error: "ビジネスモデルが見つかりません" }, { status: 404 });
  }
  const items = itemsRes.data ?? [];
  if (items.length === 0) {
    return NextResponse.json(
      { error: "このデータベースに特化先項目がありません" },
      { status: 400 }
    );
  }
  const existingIndustryIds = new Set(
    (existingRes.data ?? []).map((row) => row.industry_id)
  );

  const rows = items
    .filter((item) => !existingIndustryIds.has(item.id))
    .map((item) => ({
      business_model_id: body.business_model_id,
      industry_id: item.id,
      name: `${item.name}${bmRes.data.name}`,
    }));

  if (rows.length === 0) {
    return NextResponse.json({ inserted: 0, skipped: items.length });
  }
  const { error } = await supabase.from("segments").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    inserted: rows.length,
    skipped: items.length - rows.length,
  });
}
