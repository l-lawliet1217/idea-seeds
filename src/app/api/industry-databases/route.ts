import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

function friendlyError(message: string): { message: string; status: number } {
  if (/schema cache|does not exist/.test(message)) {
    return {
      message:
        "industry_databases テーブルが未作成です。マイグレーション 00005_industry_databases.sql をSupabaseのSQL Editorで実行してください(/setup で適用状況を確認できます)",
      status: 503,
    };
  }
  return { message, status: 500 };
}

export async function GET() {
  const { data, error } = await getSupabaseAdmin()
    .from("industry_databases")
    .select("*, industries(count)")
    .order("created_at");
  if (error) {
    const f = friendlyError(error.message);
    return NextResponse.json({ error: f.message }, { status: f.status });
  }
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
  if (error) {
    const f = friendlyError(error.message);
    return NextResponse.json({ error: f.message }, { status: f.status });
  }
  return NextResponse.json(data, { status: 201 });
}
