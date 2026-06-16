import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const admin = getSupabaseAdmin();

  // このデータベースに属する特化先項目を取得
  const { data: industries, error: indErr } = await admin
    .from("industries")
    .select("id, name")
    .eq("database_id", id);
  if (indErr) {
    return NextResponse.json({ error: indErr.message }, { status: 500 });
  }

  const industryIds = (industries ?? []).map((i) => i.id);

  // セグメント(ビジネスモデル×業種)で使用中の項目があれば削除を拒否
  if (industryIds.length > 0) {
    const { data: usedSegments, error: segErr } = await admin
      .from("segments")
      .select("name")
      .in("industry_id", industryIds);
    if (segErr) {
      return NextResponse.json({ error: segErr.message }, { status: 500 });
    }
    if (usedSegments && usedSegments.length > 0) {
      const names = usedSegments.map((s) => s.name).join("、");
      return NextResponse.json(
        {
          error: `このデータベースの項目はセグメントで使用中のため削除できません(${usedSegments.length}件: ${names})。先に該当セグメントを削除してください`,
        },
        { status: 409 }
      );
    }

    // 紐づく特化先項目を先に削除(外部キー制約のため)
    const { error: delIndErr } = await admin
      .from("industries")
      .delete()
      .eq("database_id", id);
    if (delIndErr) {
      return NextResponse.json({ error: delIndErr.message }, { status: 500 });
    }
  }

  const { error: delDbErr } = await admin
    .from("industry_databases")
    .delete()
    .eq("id", id);
  if (delDbErr) {
    return NextResponse.json({ error: delDbErr.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: id, removed_items: industryIds.length });
}
