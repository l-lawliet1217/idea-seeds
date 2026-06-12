import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { extractFriendProfile } from "@/lib/claude";

export const maxDuration = 300;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// URLまたは貼り付けテキストからプロフィールを抽出し、友人として下書き登録する
export async function POST(req: Request) {
  const body = await req.json();
  let sourceText: string = body.text?.trim() ?? "";

  if (!sourceText && body.url) {
    try {
      const res = await fetch(body.url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; AirERP/1.0)" },
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      sourceText = stripHtml(await res.text());
    } catch (err) {
      return NextResponse.json(
        {
          error: `URLの取得に失敗しました(${err instanceof Error ? err.message : "不明"})。ページの本文を貼り付けて再実行してください`,
        },
        { status: 502 }
      );
    }
  }
  if (!sourceText) {
    return NextResponse.json(
      { error: "url または text を指定してください" },
      { status: 400 }
    );
  }

  try {
    const profile = await extractFriendProfile(sourceText);
    const { data, error } = await getSupabaseAdmin()
      .from("givers_friends")
      .insert({
        ...profile,
        tier: body.tier ?? "T3",
        notes: [profile.notes, body.url ? `出典: ${body.url}` : null]
          .filter(Boolean)
          .join("\n"),
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "抽出に失敗しました" },
      { status: 500 }
    );
  }
}
