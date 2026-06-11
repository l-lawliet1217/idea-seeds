import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { generateGiversMessage, GiversMessageKind } from "@/lib/claude";
import { profileText } from "@/lib/givers";

export const maxDuration = 300;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  let query = getSupabaseAdmin()
    .from("givers_outreach")
    .select("*, givers_friends(id, name)")
    .order("created_at", { ascending: false })
    .limit(100);
  const status = searchParams.get("status");
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

const VALID_KINDS: GiversMessageKind[] = ["pitch", "connection", "birthday", "follow"];

// 指定の友人向けメッセージをClaudeで生成し、下書きとして保存
export async function POST(req: Request) {
  const body = await req.json();
  const kind = body.kind as GiversMessageKind;
  if (!body.friend_id || !VALID_KINDS.includes(kind)) {
    return NextResponse.json(
      { error: "friend_id と kind(pitch/connection/birthday/follow)は必須です" },
      { status: 400 }
    );
  }
  const supabase = getSupabaseAdmin();
  const { data: friend, error } = await supabase
    .from("givers_friends")
    .select("*")
    .eq("id", body.friend_id)
    .single();
  if (error || !friend) {
    return NextResponse.json({ error: "友人が見つかりません" }, { status: 404 });
  }

  try {
    const message = await generateGiversMessage({
      kind,
      friendProfile: `${friend.name}(${friend.company ?? ""} ${friend.position ?? ""}) ${profileText(friend)}`,
      context: body.context ?? undefined,
    });
    const { data, error: insertError } = await supabase
      .from("givers_outreach")
      .insert({ friend_id: body.friend_id, kind, message })
      .select("*, givers_friends(id, name)")
      .single();
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "生成に失敗しました" },
      { status: 500 }
    );
  }
}
