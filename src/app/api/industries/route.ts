import { NextResponse } from "next/server";
import { getSupabaseAdmin, fetchAllRows } from "@/lib/supabase-server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const databaseId = searchParams.get("database_id");
  try {
    // SELECTは既定で最大1000行のため全件ページングで取得する
    const data = await fetchAllRows(() => {
      const query = getSupabaseAdmin()
        .from("industries")
        .select("*")
        .order("created_at");
      return databaseId ? query.eq("database_id", databaseId) : query;
    });
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name は必須です" }, { status: 400 });
  }
  const { data, error } = await getSupabaseAdmin()
    .from("industries")
    .insert({
      name: body.name.trim(),
      gbizinfo_code: body.gbizinfo_code || null,
      jsic_code: body.jsic_code || null,
      source_note: body.source_note || null,
      database_id: body.database_id || null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
