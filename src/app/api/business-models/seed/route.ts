import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

// 正式なビジネスモデル10種の一括登録(登録済みはスキップ)
const OFFICIAL_BUSINESS_MODELS = [
  "特化型採用ポータル",
  "ネット買取 / 全国展開買取",
  "出張・訪問サービス",
  "予約 / 検索 / 比較ポータル",
  "特化型Eコマース",
  "サブスクリプションサービス",
  "オンライン接客サービス",
  "レンタルサービス",
  "データ集計 / DLサイト",
  "比較サイト",
];

export async function POST() {
  const supabase = getSupabaseAdmin();

  // リスト外の未使用モデルを削除(セグメントで使用中のものは保護)
  const { data: used } = await supabase
    .from("segments")
    .select("business_model_id");
  const usedIds = (used ?? []).map((row) => row.business_model_id);

  let deleteQuery = supabase
    .from("business_models")
    .delete()
    .not("name", "in", `(${OFFICIAL_BUSINESS_MODELS.map((n) => `"${n}"`).join(",")})`);
  if (usedIds.length > 0) {
    deleteQuery = deleteQuery.not("id", "in", `(${usedIds.join(",")})`);
  }
  const { error: deleteError } = await deleteQuery;
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("business_models")
    .upsert(
      OFFICIAL_BUSINESS_MODELS.map((name) => ({ name })),
      { onConflict: "name", ignoreDuplicates: true }
    )
    .select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    inserted: data?.length ?? 0,
    skipped: OFFICIAL_BUSINESS_MODELS.length - (data?.length ?? 0),
  });
}
