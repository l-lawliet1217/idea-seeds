import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import {
  JOB_KINDS,
  JobKind,
  countPendingUnits,
  estimateCost,
  unitCostUsd,
} from "@/lib/jobs";

const MAX_CAP = 2000;

// 実行前のコスト事前通知用。対象件数と概算コスト(USD/円)を返す。
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const kind = (JOB_KINDS as string[]).includes(sp.get("kind") ?? "")
    ? (sp.get("kind") as JobKind)
    : "research";
  const businessModelId = sp.get("business_model_id");
  const databaseId = sp.get("database_id");
  if (!businessModelId || !databaseId) {
    return NextResponse.json(
      { error: "business_model_id と database_id は必須です" },
      { status: 400 }
    );
  }
  const max = Math.min(Math.max(1, Number(sp.get("max_segments")) || 500), MAX_CAP);

  try {
    const pending = await countPendingUnits(getSupabaseAdmin(), kind, {
      business_model_id: businessModelId,
      database_id: databaseId,
    });
    const units = Math.min(pending, max);
    const { usd, jpy } = estimateCost(kind, units);
    return NextResponse.json({
      kind,
      pending,
      units,
      unit_cost_usd: unitCostUsd(kind),
      estimated_cost_usd: usd,
      estimated_cost_jpy: jpy,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "見積りに失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
