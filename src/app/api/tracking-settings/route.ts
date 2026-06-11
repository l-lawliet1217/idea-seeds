import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const DEFAULTS = {
  fetch_frequency_hours: 24,
  fetch_depth: 20,
  device: "desktop",
  min_sample_days: 30,
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const segmentId = searchParams.get("segment_id");
  if (!segmentId) {
    return NextResponse.json({ error: "segment_id は必須です" }, { status: 400 });
  }
  const { data, error } = await getSupabaseAdmin()
    .from("tracking_settings")
    .select("*")
    .eq("segment_id", segmentId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? { segment_id: segmentId, ...DEFAULTS });
}

export async function PUT(req: Request) {
  const body = await req.json();
  if (!body.segment_id) {
    return NextResponse.json({ error: "segment_id は必須です" }, { status: 400 });
  }
  const { data, error } = await getSupabaseAdmin()
    .from("tracking_settings")
    .upsert(
      {
        segment_id: body.segment_id,
        fetch_frequency_hours:
          Number(body.fetch_frequency_hours) || DEFAULTS.fetch_frequency_hours,
        fetch_depth: Number(body.fetch_depth) || DEFAULTS.fetch_depth,
        device: body.device === "mobile" ? "mobile" : "desktop",
        min_sample_days:
          Number(body.min_sample_days) || DEFAULTS.min_sample_days,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "segment_id" }
    )
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
