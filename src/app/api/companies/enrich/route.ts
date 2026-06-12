import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import {
  normalizeCompanyName,
  searchGbizByName,
  searchGbizByNameFlexible,
} from "@/lib/gbizinfo";

export const maxDuration = 300;

const MAX_PER_RUN = 30;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// 法人番号・従業員数・資本金をgBizINFO(無料)から補完する
// 対象: 法人番号が未取得で運営会社名が分かっている企業
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const supabase = getSupabaseAdmin();

  // gBizINFOのエラーコードを事前に1回だけ確認(全件失敗を防ぐ)
  try {
    await searchGbizByName("トヨタ自動車");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const hint = /401|403/.test(message)
      ? "(トークンが無効か、まだ有効化されていない可能性があります。申請受理メールのトークンを確認してください)"
      : "";
    return NextResponse.json(
      { error: `gBizINFOへの接続テストに失敗しました: ${message}${hint}` },
      { status: 503 }
    );
  }

  let query = supabase
    .from("companies")
    .select("id, name")
    .is("corporate_number", null)
    .order("created_at", { ascending: false })
    .limit(200);

  // 企業タブの絞り込み(ビジネスモデル×特化先DB)と同じ範囲に限定
  if (body.business_model_id || body.database_id) {
    let segQuery = supabase
      .from("segments")
      .select("id, industries!inner(database_id)");
    if (body.business_model_id) {
      segQuery = segQuery.eq("business_model_id", body.business_model_id);
    }
    if (body.database_id) {
      segQuery = segQuery.eq("industries.database_id", body.database_id);
    }
    const { data: segs, error: segError } = await segQuery;
    if (segError) {
      return NextResponse.json({ error: segError.message }, { status: 500 });
    }
    const ids = (segs ?? []).map((s) => s.id);
    if (ids.length === 0) {
      return NextResponse.json({ updated: 0, not_found: 0, skipped: 0 });
    }
    query = query.in("segment_id", ids);
  }

  const { data: companies, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const targets = (companies ?? [])
    .filter((c) => c.name && !c.name.includes("未特定"))
    .slice(0, MAX_PER_RUN);

  let updated = 0;
  let notFound = 0;
  let failed = 0;
  let firstError: string | null = null;

  for (const company of targets) {
    try {
      const results = await searchGbizByNameFlexible(company.name);
      const normalized = normalizeCompanyName(company.name);
      // 1. 正規化名の完全一致 → 2. 包含一致が1件だけ → 3. 候補が1件のみ、の順で採用
      const exact = results.find(
        (r) => normalizeCompanyName(r.name) === normalized
      );
      const containing = results.filter((r) => {
        const rn = normalizeCompanyName(r.name);
        return rn.includes(normalized) || normalized.includes(rn);
      });
      const match =
        exact ??
        (containing.length === 1 ? containing[0] : undefined) ??
        (results.length === 1 ? results[0] : undefined);

      if (!match) {
        notFound++;
        console.log(
          `enrich not_found: "${company.name}" candidates=${results.length}`
        );
      } else {
        const update: Record<string, unknown> = {
          corporate_number: match.corporate_number,
          updated_at: new Date().toISOString(),
        };
        if (match.employee_number !== null) update.employees = match.employee_number;
        if (match.capital_stock !== null) update.capital_jpy = match.capital_stock;
        if (match.location) {
          const m = match.location.match(/^(.{2,3}?[都道府県])/);
          if (m) update.prefecture = m[1];
        }
        const { error: updateError } = await supabase
          .from("companies")
          .update(update)
          .eq("id", company.id);
        if (updateError) {
          failed++;
          if (!firstError) firstError = updateError.message;
        } else updated++;
      }
    } catch (err) {
      // トークン未設定はそのままユーザーに見せる
      if (err instanceof Error && /GBIZINFO_API_TOKEN/.test(err.message)) {
        return NextResponse.json({ error: err.message }, { status: 503 });
      }
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      if (!firstError) firstError = message;
      console.error(`enrich failed: "${company.name}" ${message}`);
    }
    await sleep(700); // gBizINFOのレート制限対策
  }

  return NextResponse.json({
    targets: targets.length,
    updated,
    not_found: notFound,
    failed,
    first_error: firstError,
    remaining: (companies ?? []).length - targets.length,
  });
}
