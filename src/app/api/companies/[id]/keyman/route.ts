import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { friendlyClaudeError, researchKeyman } from "@/lib/claude";
import { extractUsage, logApiUsage } from "@/lib/usage";

export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

// 1社分のキーマン(経営陣・マーケ担当)・ベンダー・投資家をAI調査して登録する
export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: company, error } = await supabase
    .from("companies")
    .select("id, name, service_name, service_url, phone")
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

  try {
    const result = await researchKeyman({
      companyName: company.name,
      serviceName: company.service_name,
      serviceUrl: company.service_url,
    });
    const costUsd = await logApiUsage(
      "keyman",
      "claude-sonnet-4-6",
      extractUsage(result.usage),
      { company_id: id, company: company.name }
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

    // 代表電話が未登録なら反映し、調査済みフラグを立てる
    const companyUpdate: Record<string, unknown> = {
      keyman_research_done: true,
      updated_at: new Date().toISOString(),
    };
    if (!company.phone && result.main_phone) {
      companyUpdate.phone = result.main_phone;
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
