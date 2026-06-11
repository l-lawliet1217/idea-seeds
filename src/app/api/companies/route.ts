import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  let query = getSupabaseAdmin()
    .from("companies")
    .select("*, segments(id, name)")
    .order("budget_score", { ascending: false, nullsFirst: false })
    .limit(200);

  const segmentId = searchParams.get("segment_id");
  if (segmentId) query = query.eq("segment_id", segmentId);

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
