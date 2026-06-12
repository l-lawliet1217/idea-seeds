import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

// 全企業横断の担当者一覧
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  let query = getSupabaseAdmin()
    .from("contacts")
    .select("*, companies(id, name)")
    .order("created_at", { ascending: false })
    .limit(300);

  const q = searchParams.get("q");
  if (q) query = query.ilike("name", `%${q}%`);
  const role = searchParams.get("role");
  if (role) query = query.eq("role", role);
  if (searchParams.get("exclude_dnc") === "true") {
    query = query.eq("do_not_contact", false);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
