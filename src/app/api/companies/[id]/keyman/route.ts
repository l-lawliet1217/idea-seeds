import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import {
  friendlyClaudeError,
  KeymanEvidence,
  researchKeyman,
} from "@/lib/claude";
import { extractPhoneNumber, fetchHtml, fetchSerpResults } from "@/lib/serp";
import { extractUsage, logApiUsage } from "@/lib/usage";

export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

// 1社分のキーマン(経営陣・マーケ担当)・ベンダー・投資家をAI調査して登録する
export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: company, error } = await supabase
    .from("companies")
    .select("id, name, service_name, service_url, website_url, phone")
    .eq("id", id)
    .single();
  if (error || !company) {
    return NextResponse.json({ error: "企業が見つかりません" }, { status: 404 });
  }
  if (!company.name) {
    return NextResponse.json(
      { error: "社名が未取得の企業は調査できません(先に社名を取得してください)" },
      { status: 400 }
    );
  }

  if (!process.env.SERPAPI_KEY) {
    return NextResponse.json(
      { error: "SERPAPI_KEY が設定されていません" },
      { status: 503 }
    );
  }

  try {
    // SerpAPIで4系統の検索を並列実行し、タイトル+スニペットを証拠として集める
    // (Claudeのweb検索より大幅に安く、速い)
    const queries = [
      `${company.name} 代表取締役 役員`,
      `${company.name} 資金調達 出資`,
      `${company.name} 導入事例 支援`,
      `${company.name} マーケティング 担当 インタビュー`,
    ];
    const evidence: KeymanEvidence[] = [];
    const searchResults = await Promise.all(
      queries.map(async (query) => {
        try {
          return { query, results: await fetchSerpResults(query, 5, "desktop") };
        } catch {
          return { query, results: [] };
        }
      })
    );
    for (const { query, results } of searchResults) {
      for (const r of results) {
        evidence.push({ query, title: r.title, url: r.url, snippet: r.snippet });
      }
    }

    if (evidence.length === 0) {
      await supabase
        .from("companies")
        .update({ keyman_research_done: true, updated_at: new Date().toISOString() })
        .eq("id", id);
      return NextResponse.json({
        company: company.name,
        contacts_inserted: 0,
        relations_inserted: 0,
        skipped_no_source: 0,
        cost_usd: 0,
      });
    }

    const result = await researchKeyman({
      companyName: company.name,
      serviceName: company.service_name,
      evidence,
    });
    const costUsd = await logApiUsage(
      "keyman",
      "claude-sonnet-4-6",
      extractUsage(result.usage),
      { company_id: id, company: company.name, serp_searches: queries.length }
    );

    // 既存の担当者・関連会社と重複させない
    const [{ data: existingContacts }, { data: existingRelations }] =
      await Promise.all([
        supabase.from("contacts").select("name").eq("company_id", id),
        supabase.from("company_relations").select("related_name").eq("company_id", id),
      ]);
    const contactNames = new Set((existingContacts ?? []).map((c) => c.name));
    const relationNames = new Set(
      (existingRelations ?? []).map((r) => r.related_name)
    );

    // 個人情報運用ルール: 出典URLがない人物は登録しない
    let contactsInserted = 0;
    let skippedNoSource = 0;
    const contactRows: Record<string, unknown>[] = [];
    const pushPerson = (
      person: { name: string; department: string | null; position: string | null; phone: string | null; source: string | null },
      role: "executive" | "marketing"
    ) => {
      if (!person.source || !/^https?:\/\//.test(person.source)) {
        skippedNoSource++;
        return;
      }
      if (contactNames.has(person.name)) return;
      contactNames.add(person.name);
      contactRows.push({
        company_id: id,
        name: person.name,
        role,
        title: person.position,
        department: person.department,
        phone: person.phone,
        source_url: person.source,
      });
    };
    result.executives.forEach((p) => pushPerson(p, "executive"));
    result.marketing.forEach((p) => pushPerson(p, "marketing"));
    if (contactRows.length > 0) {
      const { error: contactError } = await supabase
        .from("contacts")
        .insert(contactRows);
      if (!contactError) contactsInserted = contactRows.length;
    }

    let relationsInserted = 0;
    const relationRows: Record<string, unknown>[] = [];
    for (const vendor of result.vendors) {
      if (!vendor.source || relationNames.has(vendor.name)) {
        if (!vendor.source) skippedNoSource++;
        continue;
      }
      relationNames.add(vendor.name);
      relationRows.push({
        company_id: id,
        related_name: vendor.name,
        relation_type: "vendor",
        category: vendor.category,
        detail: vendor.usage,
        website_url: vendor.website,
        source_url: vendor.source,
      });
    }
    for (const investor of result.investors) {
      if (!investor.source || relationNames.has(investor.name)) {
        if (!investor.source) skippedNoSource++;
        continue;
      }
      relationNames.add(investor.name);
      relationRows.push({
        company_id: id,
        related_name: investor.name,
        relation_type: "investor",
        detail: [investor.round, investor.date].filter(Boolean).join(" / ") || null,
        source_url: investor.source,
      });
    }
    if (relationRows.length > 0) {
      const { error: relationError } = await supabase
        .from("company_relations")
        .insert(relationRows);
      if (!relationError) relationsInserted = relationRows.length;
    }

    // 代表電話が未登録なら補完。サイト本体(header/footer)からの直接抽出を最優先し、
    // 取れなければ検索スニペット由来(result.main_phone)で補う
    const companyUpdate: Record<string, unknown> = {
      keyman_research_done: true,
      updated_at: new Date().toISOString(),
    };
    if (!company.phone) {
      let phone: string | null = null;
      const pageUrl = company.service_url ?? company.website_url;
      if (pageUrl) {
        const html = await fetchHtml(pageUrl);
        if (html) phone = extractPhoneNumber(html);
      }
      phone = phone ?? result.main_phone;
      if (phone) companyUpdate.phone = phone;
    }
    await supabase.from("companies").update(companyUpdate).eq("id", id);

    return NextResponse.json({
      company: company.name,
      contacts_inserted: contactsInserted,
      relations_inserted: relationsInserted,
      skipped_no_source: skippedNoSource,
      cost_usd: costUsd,
    });
  } catch (err) {
    return NextResponse.json({ error: friendlyClaudeError(err) }, { status: 500 });
  }
}
