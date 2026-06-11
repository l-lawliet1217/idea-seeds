import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export async function GET() {
  const { data, error } = await getSupabaseAdmin()
    .from("call_lists")
    .select("*, segments(id, name), call_list_items(count)")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// 条件(セグメント・最低スコア)から架電リストを生成する
export async function POST(req: Request) {
  const body = await req.json();
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name は必須です" }, { status: 400 });
  }
  const minScore = Number(body.min_score) || 0;
  const supabase = getSupabaseAdmin();

  // do_not_contact は必ず除外。受注済み・失注・対象外も除外
  let query = supabase
    .from("companies")
    .select("id, budget_score, contacts(id, do_not_contact)")
    .eq("do_not_contact", false)
    .not("status", "in", "(client,lost,excluded)")
    .gte("budget_score", minScore)
    .order("budget_score", { ascending: false })
    .limit(500);
  if (body.segment_id) query = query.eq("segment_id", body.segment_id);

  const { data: companies, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!companies || companies.length === 0) {
    return NextResponse.json(
      { error: "条件に合う企業がありません" },
      { status: 400 }
    );
  }

  const { data: callList, error: listError } = await supabase
    .from("call_lists")
    .insert({
      name: body.name.trim(),
      segment_id: body.segment_id ?? null,
      script_content_id: body.script_content_id ?? null,
      filter_criteria: { min_score: minScore, segment_id: body.segment_id ?? null },
    })
    .select()
    .single();
  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 });
  }

  const items = companies.map((c, index) => {
    const contact = (c.contacts as { id: string; do_not_contact: boolean }[])?.find(
      (ct) => !ct.do_not_contact
    );
    return {
      call_list_id: callList.id,
      company_id: c.id,
      contact_id: contact?.id ?? null,
      priority: companies.length - index,
    };
  });
  const { error: itemsError } = await supabase.from("call_list_items").insert(items);
  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  return NextResponse.json(
    { ...callList, item_count: items.length },
    { status: 201 }
  );
}
