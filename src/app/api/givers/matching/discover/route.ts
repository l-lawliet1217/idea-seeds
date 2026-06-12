import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { findCandidatePairs, pairKey, profileText } from "@/lib/givers";
import { friendlyClaudeError, judgeMatchCandidates } from "@/lib/claude";
import { GiverFriend, MatchCandidate } from "@/types";

export const maxDuration = 300;

const MAX_PAIRS_TO_JUDGE = 12;

// マッチング候補のオンデマンド検出
// 共通語スコアで粗選別 → Claudeで厳格判定 → 採用ペアのみ返す
export async function POST() {
  const supabase = getSupabaseAdmin();

  const [friendsRes, introsRes, feedbackRes] = await Promise.all([
    supabase.from("givers_friends").select("*").limit(1000),
    supabase.from("givers_introductions").select("friend_a_id, friend_b_id"),
    supabase
      .from("givers_match_feedback")
      .select("friend_a_id, friend_b_id, decision, reason")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  if (friendsRes.error) {
    return NextResponse.json({ error: friendsRes.error.message }, { status: 500 });
  }
  const friends = (friendsRes.data ?? []) as GiverFriend[];

  // 既存の紹介ペアと却下済みペアは候補から除外
  const exclude = new Set<string>();
  for (const i of introsRes.data ?? []) exclude.add(pairKey(i.friend_a_id, i.friend_b_id));
  for (const f of feedbackRes.data ?? []) {
    if (f.decision === "rejected") exclude.add(pairKey(f.friend_a_id, f.friend_b_id));
  }

  const pairs = findCandidatePairs(friends, exclude, MAX_PAIRS_TO_JUDGE);
  if (pairs.length === 0) {
    return NextResponse.json({ candidates: [] });
  }

  // 過去の判断をfew-shotに変換
  const nameById = new Map(friends.map((f) => [f.id, f.name]));
  const feedbackExamples = (feedbackRes.data ?? [])
    .slice(0, 10)
    .map(
      (f) =>
        `${nameById.get(f.friend_a_id) ?? "?"} × ${nameById.get(f.friend_b_id) ?? "?"}: ${
          f.decision === "adopted" ? "採用" : "却下"
        }${f.reason ? `(${f.reason})` : ""}`
    );

  try {
    const judgements = await judgeMatchCandidates(
      pairs.map((p, index) => ({
        index,
        seeker: `${p.a.name}(${p.a.company ?? ""} ${p.a.position ?? ""}) 会いたい人: ${p.a.wants_to_meet} / ${profileText(p.a)}`,
        candidate: `${p.b.name}(${p.b.company ?? ""} ${p.b.position ?? ""}) ${profileText(p.b)}`,
      })),
      feedbackExamples
    );

    const candidates: MatchCandidate[] = [];
    for (const j of judgements) {
      const pair = pairs[j.index];
      if (!pair || !j.adopt) continue;
      candidates.push({
        a: { id: pair.a.id, name: pair.a.name, company: pair.a.company },
        b: { id: pair.b.id, name: pair.b.name, company: pair.b.company },
        score: pair.score,
        reason: j.reason,
      });
    }
    return NextResponse.json({ candidates });
  } catch (err) {
    return NextResponse.json(
      { error: friendlyClaudeError(err) },
      { status: 500 }
    );
  }
}
