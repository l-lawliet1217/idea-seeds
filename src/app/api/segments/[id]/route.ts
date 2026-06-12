import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const { error } = await getSupabaseAdmin().from("segments").delete().eq("id", id);
  if (error) {
    // 外部キー制約違反 = 企業・キーワード・コンテンツ等で使用中
    if (error.code === "23503") {
      return NextResponse.json(
        {
          error:
            "このセグメントは企業・キーワード・コンテンツ等で使用中のため削除できません",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
