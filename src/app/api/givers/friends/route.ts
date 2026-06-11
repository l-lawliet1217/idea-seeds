import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  let query = getSupabaseAdmin()
    .from("givers_friends")
    .select("*")
    .order("tier")
    .order("next_contact_date", { ascending: true, nullsFirst: false })
    .limit(500);

  const tier = searchParams.get("tier");
  if (tier) query = query.eq("tier", tier);

  // 接触遅延 = 次回接触予定日が今日以前
  if (searchParams.get("overdue") === "true") {
    query = query.lte("next_contact_date", new Date().toISOString().slice(0, 10));
  }

  const q = searchParams.get("q");
  if (q) {
    query = query.or(
      `name.ilike.%${q}%,company.ilike.%${q}%,notes.ilike.%${q}%,industry.ilike.%${q}%`
    );
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name は必須です" }, { status: 400 });
  }
  const { data, error } = await getSupabaseAdmin()
    .from("givers_friends")
    .insert({
      name: body.name.trim(),
      company: body.company || null,
      position: body.position || null,
      industry: body.industry || null,
      tier: body.tier ?? "T3",
      next_contact_date: body.next_contact_date || null,
      birthday: body.birthday || null,
      tags: Array.isArray(body.tags) ? body.tags : null,
      notes: body.notes || null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
