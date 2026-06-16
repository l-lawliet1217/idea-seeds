import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { friendlyClaudeError } from "@/lib/claude";
import { serpConfigError } from "@/lib/serp";
import { researchKeymanForCompany } from "@/lib/keyman";

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

  const serpConfigErr = serpConfigError();
  if (serpConfigErr) {
    return NextResponse.json({ error: serpConfigErr }, { status: 503 });
  }

  try {
    const result = await researchKeymanForCompany(supabase, company);
    return NextResponse.json({ company: company.name, ...result });
  } catch (err) {
    return NextResponse.json({ error: friendlyClaudeError(err) }, { status: 500 });
  }
}
