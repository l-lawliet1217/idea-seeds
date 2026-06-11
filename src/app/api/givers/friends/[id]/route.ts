import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const [friend, logs] = await Promise.all([
    supabase.from("givers_friends").select("*").eq("id", id).single(),
    supabase
      .from("givers_contact_logs")
      .select("*")
      .eq("friend_id", id)
      .order("contacted_at", { ascending: false })
      .limit(100),
  ]);
  if (friend.error) {
    return NextResponse.json({ error: friend.error.message }, { status: 404 });
  }
  return NextResponse.json({ ...friend.data, contact_logs: logs.data ?? [] });
}

const PATCHABLE_FIELDS = [
  "name",
  "company",
  "position",
  "industry",
  "tier",
  "next_contact_date",
  "birthday",
  "tags",
  "notes",
] as const;

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const field of PATCHABLE_FIELDS) {
    if (field in body) update[field] = body[field] === "" ? null : body[field];
  }
  const { data, error } = await getSupabaseAdmin()
    .from("givers_friends")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const { error } = await getSupabaseAdmin()
    .from("givers_friends")
    .delete()
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
