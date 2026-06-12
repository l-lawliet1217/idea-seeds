import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const update: Record<string, unknown> = {};
  if ("research_done" in body) update.research_done = !!body.research_done;
  if ("priority" in body) update.priority = Number(body.priority) || 0;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "更新項目がありません" }, { status: 400 });
  }
  const { data, error } = await getSupabaseAdmin()
    .from("segments")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

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
