import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { generateContent } from "@/lib/claude";
import { extractDomain } from "@/lib/serp";

const GENERATABLE_TYPES = [
  "blog",
  "whitepaper",
  "proposal",
  "call_script",
  "youtube_script",
  "sns_x",
  "sns_facebook",
  "sns_linkedin",
] as const;
type GeneratableType = (typeof GENERATABLE_TYPES)[number];

export const maxDuration = 300;

export async function POST(req: Request) {
  const body = await req.json();
  const contentType = body.content_type as GeneratableType;
  if (!GENERATABLE_TYPES.includes(contentType)) {
    return NextResponse.json(
      { error: `content_type は ${GENERATABLE_TYPES.join(" / ")} のいずれかです` },
      { status: 400 }
    );
  }
  if (contentType === "proposal" && !body.company_id) {
    return NextResponse.json(
      { error: "proposal には company_id が必須です" },
      { status: 400 }
    );
  }
  // proposal以外は、セグメント直指定か派生元コンテンツのどちらかが必要
  if (contentType !== "proposal" && !body.segment_id && !body.parent_content_id) {
    return NextResponse.json(
      { error: "segment_id または parent_content_id を指定してください" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  // セグメント・キーワード収集
  let segmentName: string | null = null;
  let segmentId: string | null = body.segment_id ?? null;
  let keywords: { id: string; keyword: string }[] = [];

  // 派生元コンテンツ(Blog→台本/SNS、ホワイトペーパー→Blog等)
  let parentSummary: string | undefined;
  if (body.parent_content_id) {
    const { data: parent } = await supabase
      .from("contents")
      .select("title, body, segment_id")
      .eq("id", body.parent_content_id)
      .single();
    if (!parent) {
      return NextResponse.json(
        { error: "派生元コンテンツが見つかりません" },
        { status: 404 }
      );
    }
    parentSummary = `${parent.title}\n${(parent.body ?? "").slice(0, 2000)}`;
    if (!segmentId) segmentId = parent.segment_id;
  }

  // 企業情報(proposal用)
  let companyName: string | undefined;
  let companyContext: string | undefined;

  if (body.company_id) {
    const { data: company } = await supabase
      .from("companies")
      .select("name, website_url, segment_id")
      .eq("id", body.company_id)
      .single();
    if (!company) {
      return NextResponse.json({ error: "企業が見つかりません" }, { status: 404 });
    }
    companyName = company.name;
    if (!segmentId) segmentId = company.segment_id;

    // 直近30日のSERPから対象企業ドメインの順位を抽出して調査メモにする
    const domain = company.website_url ? extractDomain(company.website_url) : null;
    if (domain) {
      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const { data: serp } = await supabase
        .from("serp_results")
        .select("position, fetched_at, keywords(keyword)")
        .eq("domain", domain)
        .gte("fetched_at", since)
        .order("fetched_at", { ascending: false })
        .limit(30);
      if (serp && serp.length > 0) {
        companyContext = serp
          .map((row) => {
            const kw = (row.keywords as unknown as { keyword: string } | null)
              ?.keyword;
            return `「${kw ?? "?"}」 ${row.position}位 (${row.fetched_at.slice(0, 10)})`;
          })
          .join("\n");
      } else {
        companyContext = `対象ドメイン(${domain})は計測中キーワードの検索結果上位に未出現。検索流入の機会損失が大きい状態。`;
      }
    }
  }

  if (segmentId) {
    const { data: segment } = await supabase
      .from("segments")
      .select("name")
      .eq("id", segmentId)
      .single();
    segmentName = segment?.name ?? null;

    if (Array.isArray(body.keyword_ids) && body.keyword_ids.length > 0) {
      const { data } = await supabase
        .from("keywords")
        .select("id, keyword")
        .in("id", body.keyword_ids);
      keywords = data ?? [];
    } else {
      const { data } = await supabase
        .from("keywords")
        .select("id, keyword")
        .eq("segment_id", segmentId)
        .eq("is_tracked", true)
        .limit(15);
      keywords = data ?? [];
    }
  }

  try {
    const generated = await generateContent({
      contentType,
      segmentName,
      keywords: keywords.map((k) => k.keyword),
      companyName,
      companyContext,
      parentSummary,
    });

    const { data, error } = await supabase
      .from("contents")
      .insert({
        content_type: contentType,
        segment_id: segmentId,
        company_id: body.company_id ?? null,
        parent_content_id: body.parent_content_id ?? null,
        title: generated.title,
        body: generated.body,
        keywords_used: keywords.map((k) => k.id),
        status: "draft",
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "生成に失敗しました" },
      { status: 500 }
    );
  }
}
