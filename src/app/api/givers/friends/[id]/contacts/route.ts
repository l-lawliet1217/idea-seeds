import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

type Params = { params: Promise<{ id: string }> };

// 接触を記録し、最終接触日(と任意で次回予定)を更新する
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const contactedAt: string =
    body.contacted_at || new Date().toISOString().slice(0, 10);

  const supabase = getSupabaseAdmin();
  const { data: log, error } = await supabase
    .from("givers_contact_logs")
    .insert({
      friend_id: id,
      contacted_at: contactedAt,
      channel: body.channel || null,
      memo: body.memo || null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const update: Record<string, unknown> = {
    last_contact_date: contactedAt,
    updated_at: new Date().toISOString(),
  };
  if (body.next_contact_date) update.next_contact_date = body.next_contact_date;
  await supabase.from("givers_friends").update(update).eq("id", id);

  return NextResponse.json(log, { status: 201 });
}
