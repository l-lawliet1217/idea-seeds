import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const { data, error } = await getSupabaseAdmin()
    .from("contacts")
    .select("*")
    .eq("company_id", id)
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await req.json();

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name は必須です" }, { status: 400 });
  }
  // 個人情報運用ルール: 取得元URLなしの登録は禁止
  if (!body.source_url?.trim()) {
    return NextResponse.json(
      { error: "source_url(取得元URL)は必須です" },
      { status: 400 }
    );
  }

  const { data, error } = await getSupabaseAdmin()
    .from("contacts")
    .insert({
      company_id: id,
      name: body.name.trim(),
      role: body.role ?? "other",
      title: body.title || null,
      email: body.email || null,
      phone: body.phone || null,
      source_url: body.source_url.trim(),
      note: body.note || null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
