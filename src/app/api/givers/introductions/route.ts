import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { generateGiversMessage } from "@/lib/claude";
import { profileText } from "@/lib/givers";

export const maxDuration = 300;

export async function GET() {
  const { data, error } = await getSupabaseAdmin()
    .from("givers_introductions")
    .select(
      "*, friend_a:givers_friends!givers_introductions_friend_a_id_fkey(id, name, company), friend_b:givers_friends!givers_introductions_friend_b_id_fkey(id, name, company)"
    )
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// マッチング採用 = 紹介レコード作成 + 採用フィードバック記録 + 打診文の下書き生成
export async function POST(req: Request) {
  const body = await req.json();
  if (!body.friend_a_id || !body.friend_b_id) {
    return NextResponse.json(
      { error: "friend_a_id と friend_b_id は必須です" },
      { status: 400 }
    );
  }
  const supabase = getSupabaseAdmin();

  const { data: intro, error } = await supabase
    .from("givers_introductions")
    .insert({
      friend_a_id: body.friend_a_id,
      friend_b_id: body.friend_b_id,
      reason: body.reason ?? null,
      status: "candidate",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 採用判断を学習データとして記録
  await supabase.from("givers_match_feedback").insert({
    friend_a_id: body.friend_a_id,
    friend_b_id: body.friend_b_id,
    decision: "adopted",
    reason: body.reason ?? null,
  });

  // 打診文を生成してアウトリーチ下書きに追加(失敗しても紹介自体は成立)
  try {
    const { data: friends } = await supabase
      .from("givers_friends")
      .select("*")
      .in("id", [body.friend_a_id, body.friend_b_id]);
    const a = friends?.find((f) => f.id === body.friend_a_id);
    const b = friends?.find((f) => f.id === body.friend_b_id);
    if (a && b) {
      const message = await generateGiversMessage({
        kind: "pitch",
        friendProfile: `${a.name}(${a.company ?? ""} ${a.position ?? ""})`,
        otherProfile: `${b.name}(${b.company ?? ""} ${b.position ?? ""}) ${profileText(b)}`,
        context: body.reason ?? undefined,
      });
      await supabase.from("givers_outreach").insert({
        friend_id: body.friend_a_id,
        kind: "pitch",
        message,
        introduction_id: intro.id,
      });
    }
  } catch {
    // 打診文生成の失敗は無視(アウトリーチ画面から再生成できる)
  }

  return NextResponse.json(intro, { status: 201 });
}
