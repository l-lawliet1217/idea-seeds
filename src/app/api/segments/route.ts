import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export async function GET() {
  const { data, error } = await getSupabaseAdmin()
    .from("segments")
    .select("*, business_models(*), industries(*, industry_databases(name))")
    .order("priority", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.business_model_id || !body.industry_id) {
    return NextResponse.json(
      { error: "business_model_id と industry_id は必須です" },
      { status: 400 }
    );
  }
  const supabase = getSupabaseAdmin();

  let name: string | undefined = body.name?.trim();
  if (!name) {
    const [{ data: bm }, { data: ind }] = await Promise.all([
      supabase.from("business_models").select("name").eq("id", body.business_model_id).single(),
      supabase.from("industries").select("name").eq("id", body.industry_id).single(),
    ]);
    name = `${bm?.name ?? "?"}×${ind?.name ?? "?"}`;
  }

  const { data, error } = await supabase
    .from("segments")
    .insert({
      business_model_id: body.business_model_id,
      industry_id: body.industry_id,
      name,
      priority: body.priority ?? 0,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
