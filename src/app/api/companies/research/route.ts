import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { friendlyClaudeError } from "@/lib/claude";
import { serpConfigError } from "@/lib/serp";
import { researchSegment } from "@/lib/research";

export const maxDuration = 120;

// 高速リサーチ(1セグメント):
// 1. セグメント名でGoogle検索→上位件
// 2. 該当しそうなサイトだけHaikuで選別
// 3. 採用サイトのHTMLからサービス名と運営会社名を抽出して登録
export async function POST(req: Request) {
  const body = await req.json();
  if (!body.segment_id) {
    return NextResponse.json({ error: "segment_id は必須です" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: segment, error: segmentError } = await supabase
    .from("segments")
    .select("id, name")
    .eq("id", body.segment_id)
    .single();
  if (segmentError || !segment) {
    return NextResponse.json({ error: "セグメントが見つかりません" }, { status: 404 });
  }

  const serpConfigErr = serpConfigError();
  if (serpConfigErr) {
    return NextResponse.json({ error: serpConfigErr }, { status: 503 });
  }

  try {
    const result = await researchSegment(supabase, segment);
    return NextResponse.json({
      segment: segment.name,
      found: result.found,
      inserted: result.inserted,
      duplicates: result.duplicates,
      skipped: result.found - result.inserted,
      cost_usd: result.cost_usd,
    });
  } catch (err) {
    return NextResponse.json({ error: friendlyClaudeError(err) }, { status: 500 });
  }
}
