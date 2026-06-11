import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

// 候補の却下を記録する(次回のdiscoverで除外され、判定プロンプトにも学習例として入る)
export async function POST(req: Request) {
  const body = await req.json();
  if (!body.friend_a_id || !body.friend_b_id || !body.decision) {
    return NextResponse.json(
      { error: "friend_a_id / friend_b_id / decision は必須です" },
      { status: 400 }
    );
  }
  const { data, error } = await getSupabaseAdmin()
    .from("givers_match_feedback")
    .insert({
      friend_a_id: body.friend_a_id,
      friend_b_id: body.friend_b_id,
      decision: body.decision === "adopted" ? "adopted" : "rejected",
      reason: body.reason ?? null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
