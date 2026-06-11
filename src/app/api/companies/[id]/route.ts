import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const [company, contacts, relations, activities] = await Promise.all([
    supabase.from("companies").select("*, segments(id, name)").eq("id", id).single(),
    supabase.from("contacts").select("*").eq("company_id", id).order("created_at"),
    supabase.from("company_relations").select("*").eq("company_id", id),
    supabase
      .from("activities")
      .select("*")
      .eq("company_id", id)
      .order("occurred_at", { ascending: false })
      .limit(100),
  ]);

  if (company.error) {
    return NextResponse.json({ error: company.error.message }, { status: 404 });
  }
  return NextResponse.json({
    ...company.data,
    contacts: contacts.data ?? [],
    company_relations: relations.data ?? [],
    activities: activities.data ?? [],
  });
}

const PATCHABLE_FIELDS = ["status", "note", "do_not_contact", "segment_id"] as const;

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await req.json();

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const field of PATCHABLE_FIELDS) {
    if (field in body) update[field] = body[field];
  }

  const { data, error } = await getSupabaseAdmin()
    .from("companies")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
