import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const segmentId = searchParams.get("segment_id");
  if (!segmentId) {
    return NextResponse.json({ error: "segment_id は必須です" }, { status: 400 });
  }
  const { data, error } = await getSupabaseAdmin()
    .from("keywords")
    .select("*")
    .eq("segment_id", segmentId)
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const body = await req.json();
  const segmentId: string | undefined = body.segment_id;
  const keywords: string[] = Array.isArray(body.keywords) ? body.keywords : [];
  if (!segmentId || keywords.length === 0) {
    return NextResponse.json(
      { error: "segment_id と keywords は必須です" },
      { status: 400 }
    );
  }

  const rows = [...new Set(keywords.map((k) => k.trim()).filter(Boolean))].map(
    (keyword) => ({ segment_id: segmentId, keyword })
  );
  const { data, error } = await getSupabaseAdmin()
    .from("keywords")
    .upsert(rows, { onConflict: "segment_id,keyword", ignoreDuplicates: true })
    .select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ inserted: data?.length ?? 0 }, { status: 201 });
}
