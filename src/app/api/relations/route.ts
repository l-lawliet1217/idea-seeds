import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

// 全企業横断のパートナー(支援ベンダー・投資家)一覧
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  let query = getSupabaseAdmin()
    .from("company_relations")
    .select("*, companies(id, name)")
    .order("collected_at", { ascending: false })
    .limit(300);

  const type = searchParams.get("type");
  if (type) query = query.eq("relation_type", type);
  const q = searchParams.get("q");
  if (q) query = query.ilike("related_name", `%${q}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
