import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { friendlyClaudeError, researchCompanies } from "@/lib/claude";
import { extractDomain } from "@/lib/serp";
import { extractUsage, logApiUsage } from "@/lib/usage";

export const maxDuration = 300;

// 1セグメント分のAI企業リサーチを実行し、見つかった企業を登録する
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

  try {
    const outcome = await researchCompanies(segment.name);
    const usage = extractUsage(outcome.usage);
    const costUsd = await logApiUsage("research", "claude-sonnet-4-6", usage, {
      segment_id: segment.id,
      segment: segment.name,
    });
    const results = outcome.companies;
    if (results.length === 0) {
      return NextResponse.json({
        segment: segment.name,
        inserted: 0,
        found: 0,
        cost_usd: costUsd,
        web_searches: usage.web_searches,
      });
    }

    // 既存企業との重複をドメインで除外
    const domains = results
      .map((r) => extractDomain(r.service_url))
      .filter((d): d is string => !!d);
    const { data: existing } = await supabase
      .from("companies")
      .select("service_url, website_url");
    const existingDomains = new Set(
      (existing ?? [])
        .flatMap((row) => [row.service_url, row.website_url])
        .map((u) => (u ? extractDomain(u) : null))
        .filter(Boolean)
    );

    const now = new Date().toISOString();
    const rows = results
      .filter((r) => {
        const domain = extractDomain(r.service_url);
        return domain && !existingDomains.has(domain);
      })
      .map((r) => ({
        segment_id: segment.id,
        name: r.company_name ?? `${r.service_name} 運営会社(未特定)`,
        service_name: r.service_name,
        service_url: r.service_url,
        website_url: r.service_url,
        employees: r.employees,
        capital_jpy: r.capital_jpy,
        phone: r.phone,
        status: "candidate",
        source: "ai_research",
        source_url: r.service_url,
        collected_at: now,
      }));

    let inserted = 0;
    if (rows.length > 0) {
      const { error } = await supabase.from("companies").insert(rows);
      if (error) {
        const message = /schema cache|does not exist/.test(error.message)
          ? "companiesテーブルに新しい列がありません。マイグレーション 00006_company_research.sql をSupabaseのSQL Editorで実行してください(/setup で適用状況を確認できます)"
          : error.message;
        return NextResponse.json({ error: message }, { status: 500 });
      }
      inserted = rows.length;
    }
    return NextResponse.json({
      segment: segment.name,
      found: results.length,
      inserted,
      skipped: results.length - inserted,
      cost_usd: costUsd,
      web_searches: usage.web_searches,
    });
  } catch (err) {
    return NextResponse.json({ error: friendlyClaudeError(err) }, { status: 500 });
  }
}
