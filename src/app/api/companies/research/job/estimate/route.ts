import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import {
  JOB_MODES,
  JobMode,
  ALL_PHASES,
  countPendingUnits,
  estimateCost,
  unitCostUsd,
} from "@/lib/jobs";

const MAX_CAP = 2000;

// 実行前のコスト事前通知用。対象件数と概算コスト(USD/円)を返す。
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const kind = (JOB_MODES as string[]).includes(sp.get("kind") ?? "")
    ? (sp.get("kind") as JobMode)
    : "research";
  const filter = {
    business_model_id: sp.get("business_model_id") || null,
    database_id: sp.get("database_id") || null,
  };
  const max = Math.min(Math.max(1, Number(sp.get("max_segments")) || 500), MAX_CAP);
  const supabase = getSupabaseAdmin();

  try {
    if (kind === "all") {
      const [r, e, k] = await Promise.all(
        ALL_PHASES.map((p) => countPendingUnits(supabase, p, filter))
      );
      const unitsR = Math.min(r, max);
      const unitsE = Math.min(e, max);
      const unitsK = Math.min(k, max);
      const usd =
        estimateCost("research", unitsR).usd + estimateCost("keyman", unitsK).usd;
      return NextResponse.json({
        kind,
        breakdown: { research: unitsR, enrich: unitsE, keyman: unitsK },
        units: unitsR + unitsE + unitsK,
        pending: r + e + k,
        estimated_cost_usd: usd,
        estimated_cost_jpy: Math.round(usd * 160),
        note: "③キーマンの対象は①で新たに見つかった企業ぶん増えるため、実費はこの見積りより大きくなることがあります",
      });
    }

    const pending = await countPendingUnits(supabase, kind, filter);
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
