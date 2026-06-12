import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("companies")
    .select("*, segments(id, name)")
    .order("created_at", { ascending: false })
    .limit(500);

  const segmentId = searchParams.get("segment_id");
  if (segmentId) query = query.eq("segment_id", segmentId);

  // ビジネスモデル / 特化先DB での絞り込み(該当セグメント群に展開)
  const businessModelId = searchParams.get("business_model_id");
  const databaseId = searchParams.get("database_id");
  if (businessModelId || databaseId) {
    let segQuery = supabase.from("segments").select("id, industries!inner(database_id)");
    if (businessModelId) segQuery = segQuery.eq("business_model_id", businessModelId);
    if (databaseId) segQuery = segQuery.eq("industries.database_id", databaseId);
    const { data: segs, error: segError } = await segQuery;
    if (segError) {
      return NextResponse.json({ error: segError.message }, { status: 500 });
    }
    const ids = (segs ?? []).map((s) => s.id);
    if (ids.length === 0) return NextResponse.json([]);
    query = query.in("segment_id", ids);
  }

  const status = searchParams.get("status");
  if (status) query = query.eq("status", status);

  if (searchParams.get("exclude_dnc") === "true") {
    query = query.eq("do_not_contact", false);
  }

  const q = searchParams.get("q");
  if (q) query = query.ilike("name", `%${q}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
