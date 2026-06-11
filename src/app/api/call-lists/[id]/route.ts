import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const [list, items] = await Promise.all([
    supabase
      .from("call_lists")
      .select("*, segments(id, name), script:contents(id, title, body)")
      .eq("id", id)
      .single(),
    supabase
      .from("call_list_items")
      .select("*, companies(*, contacts(*))")
      .eq("call_list_id", id)
      .order("priority", { ascending: false }),
  ]);

  if (list.error) {
    return NextResponse.json({ error: list.error.message }, { status: 404 });
  }
  return NextResponse.json({ ...list.data, items: items.data ?? [] });
}
