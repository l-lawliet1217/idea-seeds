import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { rewriteMessage } from "@/lib/claude";

export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

// 下書きメッセージを指示に従ってClaudeで書き直す
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  if (!body.instruction?.trim()) {
    return NextResponse.json({ error: "instruction は必須です" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: outreach, error } = await supabase
    .from("givers_outreach")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !outreach) {
    return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
  }
  if (outreach.status === "sent") {
    return NextResponse.json(
      { error: "送信済みのメッセージは書き換えできません" },
      { status: 400 }
    );
  }

  try {
    const rewritten = await rewriteMessage(outreach.message, body.instruction);
    const { data, error: updateError } = await supabase
      .from("givers_outreach")
      .update({ message: rewritten })
      .eq("id", id)
      .select("*, givers_friends(id, name)")
      .single();
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "書き換えに失敗しました" },
      { status: 500 }
    );
  }
}
