import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const { data, error } = await getSupabaseAdmin()
    .from("company_relations")
    .select("*")
    .eq("company_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await req.json();

  if (!body.related_name?.trim()) {
    return NextResponse.json({ error: "related_name は必須です" }, { status: 400 });
  }
  if (body.relation_type !== "vendor" && body.relation_type !== "investor") {
    return NextResponse.json(
      { error: "relation_type は vendor / investor のいずれかです" },
      { status: 400 }
    );
  }

  const { data, error } = await getSupabaseAdmin()
    .from("company_relations")
    .insert({
      company_id: id,
      related_name: body.related_name.trim(),
      relation_type: body.relation_type,
      phone: body.phone || null,
      source_url: body.source_url || null,
      note: body.note || null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
