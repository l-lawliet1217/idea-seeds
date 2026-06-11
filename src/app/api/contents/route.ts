import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  let query = getSupabaseAdmin()
    .from("contents")
    .select(
      "id, content_type, title, status, segment_id, company_id, parent_content_id, published_url, created_at, segments(id, name), companies(id, name)"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  const type = searchParams.get("type");
  if (type) query = query.eq("content_type", type);
  const status = searchParams.get("status");
  if (status) query = query.eq("status", status);
  const segmentId = searchParams.get("segment_id");
  if (segmentId) query = query.eq("segment_id", segmentId);
  const companyId = searchParams.get("company_id");
  if (companyId) query = query.eq("company_id", companyId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
