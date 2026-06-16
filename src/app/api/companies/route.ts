import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const supabase = getSupabaseAdmin();

  const businessModelId = searchParams.get("business_model_id");
  const databaseId = searchParams.get("database_id");

  // ビジネスモデル / 特化先DB での絞り込みは埋め込みinner joinでDB側で行う。
  // (該当セグメントID群をINで渡すと、大規模DBで巨大なクエリになり破綻するため)
  const filterByBmDb = !!(businessModelId || databaseId);
  const select = filterByBmDb
    ? "*, segments!inner(id, name, business_model_id, industries!inner(database_id))"
    : "*, segments(id, name)";

  const limit = Math.min(Math.max(1, Number(searchParams.get("limit")) || 1000), 5000);
  let query = supabase
    .from("companies")
    .select(select)
    .order("created_at", { ascending: false })
    .limit(limit);

  const segmentId = searchParams.get("segment_id");
  if (segmentId) query = query.eq("segment_id", segmentId);
  if (businessModelId) query = query.eq("segments.business_model_id", businessModelId);
  if (databaseId) query = query.eq("segments.industries.database_id", databaseId);

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
