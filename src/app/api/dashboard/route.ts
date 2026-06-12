import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export async function GET() {
  const supabase = getSupabaseAdmin();
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const today = new Date().toISOString().slice(0, 10);

  const count = (table: string, filter?: (q: any) => any) => {
    let q = supabase.from(table).select("*", { count: "exact", head: true });
    if (filter) q = filter(q);
    return q;
  };

  const [
    companiesTotal,
    candidates,
    approaching,
    negotiating,
    clients,
    unscored,
    contentsDraft,
    contentsInReview,
    contentsPublished,
    keywordsTracked,
    callsWeek,
    appointmentsWeek,
    latestSerp,
    giversOverdue,
    giversOpenTriggers,
  ] = await Promise.all([
    count("companies"),
    count("companies", (q) => q.eq("status", "candidate")),
    count("companies", (q) => q.eq("status", "approaching")),
    count("companies", (q) => q.eq("status", "negotiating")),
    count("companies", (q) => q.eq("status", "client")),
    count("companies", (q) => q.is("budget_score", null).eq("do_not_contact", false)),
    count("contents", (q) => q.eq("status", "draft")),
    count("contents", (q) => q.eq("status", "in_review")),
    count("contents", (q) => q.eq("status", "published")),
    count("keywords", (q) => q.eq("is_tracked", true)),
    count("calls", (q) => q.gte("called_at", weekAgo)),
    count("calls", (q) => q.eq("result", "appointment").gte("called_at", weekAgo)),
    supabase
      .from("serp_results")
      .select("fetched_at")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    count("givers_friends", (q) => q.lte("next_contact_date", today).neq("tier", "T5")),
    count("givers_triggers", (q) => q.eq("status", "open")),
  ]);

  const firstError = [companiesTotal, contentsDraft, keywordsTracked, callsWeek].find(
    (r) => r.error
  )?.error;
  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 500 });
  }

  return NextResponse.json({
    companies: {
      total: companiesTotal.count ?? 0,
      candidate: candidates.count ?? 0,
      approaching: approaching.count ?? 0,
      negotiating: negotiating.count ?? 0,
      client: clients.count ?? 0,
      unscored: unscored.count ?? 0,
    },
    contents: {
      draft: contentsDraft.count ?? 0,
      in_review: contentsInReview.count ?? 0,
      published: contentsPublished.count ?? 0,
    },
    keywords: { tracked: keywordsTracked.count ?? 0 },
    calls: {
      week: callsWeek.count ?? 0,
      appointments_week: appointmentsWeek.count ?? 0,
    },
    serp: { last_fetched_at: latestSerp.data?.fetched_at ?? null },
    givers: {
      overdue: giversOverdue.count ?? 0,
      open_triggers: giversOpenTriggers.count ?? 0,
    },
  });
}
