import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const { data, error } = await getSupabaseAdmin()
    .from("contents")
    .select("*, segments(id, name), companies(id, name)")
    .eq("id", id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

const PATCHABLE_FIELDS = ["title", "body", "status", "review_note"] as const;

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await req.json();

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const field of PATCHABLE_FIELDS) {
    if (field in body) update[field] = body[field];
  }
  // 公開はWordPress連携(/publish)経由のみ。直接publishedへの変更は禁止
  if (update.status === "published") {
    return NextResponse.json(
      { error: "公開は /publish エンドポイントから実行してください" },
      { status: 400 }
    );
  }

  const { data, error } = await getSupabaseAdmin()
    .from("contents")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
