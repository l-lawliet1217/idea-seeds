import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  let query = getSupabaseAdmin()
    .from("givers_triggers")
    .select("*, givers_friends(id, name)")
    .order("created_at", { ascending: false })
    .limit(200);
  const status = searchParams.get("status");
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.friend_id || !body.content?.trim()) {
    return NextResponse.json(
      { error: "friend_id と content は必須です" },
      { status: 400 }
    );
  }
  const { data, error } = await getSupabaseAdmin()
    .from("givers_triggers")
    .insert({
      friend_id: body.friend_id,
      trigger_type: body.trigger_type || null,
      content: body.content.trim(),
      source: body.source || "manual",
    })
    .select("*, givers_friends(id, name)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
