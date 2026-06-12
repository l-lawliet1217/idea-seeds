import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export async function GET() {
  const { data, error } = await getSupabaseAdmin()
    .from("industry_databases")
    .select("*, industries(count)")
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name は必須です" }, { status: 400 });
  }
  const { data, error } = await getSupabaseAdmin()
    .from("industry_databases")
    .insert({ name: body.name.trim(), source_note: body.source_note || null })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
