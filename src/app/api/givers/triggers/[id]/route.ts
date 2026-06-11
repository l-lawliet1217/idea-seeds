import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  if (!["open", "in_progress", "done"].includes(body.status)) {
    return NextResponse.json({ error: "status が不正です" }, { status: 400 });
  }
  const { data, error } = await getSupabaseAdmin()
    .from("givers_triggers")
    .update({ status: body.status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
