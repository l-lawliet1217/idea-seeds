import { NextResponse } from "next/server";
import { marked } from "marked";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { publishToWordPress } from "@/lib/wordpress";

type Params = { params: Promise<{ id: string }> };

const PUBLISHABLE_TYPES = ["blog", "whitepaper", "proposal"];

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: content, error } = await supabase
    .from("contents")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !content) {
    return NextResponse.json({ error: "コンテンツが見つかりません" }, { status: 404 });
  }
  if (!PUBLISHABLE_TYPES.includes(content.content_type)) {
    return NextResponse.json(
      { error: "このコンテンツ種別はWordPress公開対象外です" },
      { status: 400 }
    );
  }
  // 人間レビューを通過していないものは公開不可
  if (content.status !== "approved") {
    return NextResponse.json(
      { error: "承認済み(approved)のコンテンツのみ公開できます" },
      { status: 400 }
    );
  }

  try {
    const html = await marked.parse(content.body ?? "");
    const post = await publishToWordPress({
      title: content.title,
      contentHtml: html,
    });

    const { data, error: updateError } = await supabase
      .from("contents")
      .update({
        status: "published",
        wordpress_post_id: post.id,
        published_url: post.link,
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (content.company_id) {
      await supabase.from("activities").insert({
        company_id: content.company_id,
        activity_type: "content_published",
        ref_table: "contents",
        ref_id: id,
        summary: `コンテンツ公開: ${content.title}`,
      });
    }
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "公開に失敗しました" },
      { status: 500 }
    );
  }
}
