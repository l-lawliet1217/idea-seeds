import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { fetchSerpResults, extractDomain } from "@/lib/serp";

export const maxDuration = 300;

const MAX_KEYWORDS_PER_RUN = 200;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Vercel Cron から日次で呼ばれる。CRON_SECRET で保護
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: keywords, error } = await supabase
    .from("keywords")
    .select("id, keyword, segment_id, tracking:segments(tracking_settings(*))")
    .eq("is_tracked", true)
    .limit(MAX_KEYWORDS_PER_RUN);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const fetchedAt = new Date().toISOString();
  let processed = 0;
  let failed = 0;

  for (const kw of keywords ?? []) {
    const settings = (
      kw.tracking as unknown as {
        tracking_settings: { fetch_depth: number; device: string }[] | null;
      } | null
    )?.tracking_settings?.[0];
    const depth = settings?.fetch_depth ?? 20;
    const device = settings?.device ?? "desktop";

    try {
      const results = await fetchSerpResults(kw.keyword, depth, device);
      if (results.length > 0) {
        const rows = results.map((r) => ({
          keyword_id: kw.id,
          fetched_at: fetchedAt,
          position: r.position,
          url: r.url,
          domain: extractDomain(r.url) ?? "",
          title: r.title,
        }));
        const { error: insertError } = await supabase
          .from("serp_results")
          .insert(rows);
        if (insertError) throw new Error(insertError.message);
      }
      processed++;
    } catch {
      failed++;
    }
    await sleep(200);
  }

  return NextResponse.json({ processed, failed, total: keywords?.length ?? 0 });
}
