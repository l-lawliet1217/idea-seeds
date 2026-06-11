import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { CALL_RESULT_LABELS, CallResult } from "@/types";

// 架電結果の記録。result=refused の場合はDBトリガーが do_not_contact を自動更新する
export async function POST(req: Request) {
  const body = await req.json();
  if (!body.company_id || !body.result) {
    return NextResponse.json(
      { error: "company_id と result は必須です" },
      { status: 400 }
    );
  }
  if (!(body.result in CALL_RESULT_LABELS)) {
    return NextResponse.json({ error: "result が不正です" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: call, error } = await supabase
    .from("calls")
    .insert({
      call_list_item_id: body.call_list_item_id ?? null,
      company_id: body.company_id,
      contact_id: body.contact_id ?? null,
      result: body.result,
      memo: body.memo || null,
      duration_seconds: body.duration_seconds ?? null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (body.call_list_item_id) {
    await supabase
      .from("call_list_items")
      .update({ status: "called" })
      .eq("id", body.call_list_item_id);
  }

  // アポ獲得時はファネル前段の企業を自動で商談中に進める
  if (body.result === "appointment") {
    await supabase
      .from("companies")
      .update({ status: "negotiating", updated_at: new Date().toISOString() })
      .eq("id", body.company_id)
      .in("status", ["candidate", "qualified", "approaching"]);
  }

  await supabase.from("activities").insert({
    company_id: body.company_id,
    activity_type: "call",
    ref_table: "calls",
    ref_id: call.id,
    summary: `架電: ${CALL_RESULT_LABELS[body.result as CallResult]}${body.memo ? ` - ${body.memo}` : ""}`,
  });

  return NextResponse.json(call, { status: 201 });
}
