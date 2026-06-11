import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { calcNextContactDate } from "@/lib/givers";

type Params = { params: Promise<{ id: string }> };

// 接触を記録し、最終接触日と次回予定を更新する。
// 次回予定の指定がなければ「最終接触 + 接触サイクル(月)」で自動算出
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
      duration_minutes: body.duration_minutes ?? null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const update: Record<string, unknown> = {
    last_contact_date: contactedAt,
    updated_at: new Date().toISOString(),
  };
  if (body.next_contact_date) {
    update.next_contact_date = body.next_contact_date;
  } else {
    const { data: friend } = await supabase
      .from("givers_friends")
      .select("contact_cycle_months")
      .eq("id", id)
      .single();
    update.next_contact_date = calcNextContactDate(
      contactedAt,
      friend?.contact_cycle_months ?? 3
    );
  }
  await supabase.from("givers_friends").update(update).eq("id", id);

  return NextResponse.json(log, { status: 201 });
}
