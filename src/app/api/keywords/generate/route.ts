import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { friendlyClaudeError, generateKeywords } from "@/lib/claude";

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.segment_id) {
    return NextResponse.json({ error: "segment_id は必須です" }, { status: 400 });
  }

  const { data: segment, error } = await getSupabaseAdmin()
    .from("segments")
    .select("name, business_models(name), industries(name)")
    .eq("id", body.segment_id)
    .single();
  if (error || !segment) {
    return NextResponse.json({ error: "セグメントが見つかりません" }, { status: 404 });
  }

  try {
    const keywords = await generateKeywords({
      segmentName: segment.name,
      businessModel:
        (segment.business_models as unknown as { name: string } | null)?.name ??
        null,
      industry:
        (segment.industries as unknown as { name: string } | null)?.name ?? null,
    });
    return NextResponse.json({ keywords });
  } catch (err) {
    return NextResponse.json(
      { error: friendlyClaudeError(err) },
      { status: 500 }
    );
  }
}
