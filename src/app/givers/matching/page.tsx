"use client";

import { useCallback, useEffect, useState } from "react";
import GiversNav from "../givers-nav";
import {
  GiverIntroduction,
  INTRO_STATUS_LABELS,
  IntroStatus,
  MatchCandidate,
} from "@/types";

const FLOW: IntroStatus[] = ["candidate", "pitched", "connected", "completed"];

export default function MatchingPage() {
  const [candidates, setCandidates] = useState<MatchCandidate[] | null>(null);
  const [intros, setIntros] = useState<GiverIntroduction[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const data = await fetch("/api/givers/introductions").then((r) => r.json());
    if (Array.isArray(data)) setIntros(data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function discover() {
    setDiscovering(true);
    setError("");
    const res = await fetch("/api/givers/matching/discover", { method: "POST" });
    const data = await res.json();
    setDiscovering(false);
    if (!res.ok) {
      setError(data.error ?? "検出に失敗しました");
      return;
    }
    setCandidates(data.candidates);
  }

  async function adopt(c: MatchCandidate) {
    setError("");
    const res = await fetch("/api/givers/introductions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        friend_a_id: c.a.id,
        friend_b_id: c.b.id,
        reason: c.reason,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "採用に失敗しました");
      return;
    }
    setCandidates((prev) => prev?.filter((x) => x !== c) ?? null);
    load();
  }

  async function reject(c: MatchCandidate) {
    await fetch("/api/givers/match-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        friend_a_id: c.a.id,
        friend_b_id: c.b.id,
        decision: "rejected",
      }),
    });
    setCandidates((prev) => prev?.filter((x) => x !== c) ?? null);
  }

  async function advance(intro: GiverIntroduction) {
    const next = FLOW[FLOW.indexOf(intro.status) + 1];
    if (!next) return;
    await fetch(`/api/givers/introductions/${intro.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    load();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Matching</h1>
      <GiversNav />
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            候補検出(共通語スコア → Claude厳格判定)
          </h2>
          <button
            onClick={discover}
            disabled={discovering}
            className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm disabled:opacity-40"
          >
            {discovering ? "検出中(1-2分)..." : "候補を検出"}
          </button>
        </div>
        {candidates === null ? (
          <p className="text-sm text-gray-400">
            「候補を検出」を実行すると、会いたい人が登録された友人を起点に紹介ペアを提案します
          </p>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-gray-400">採用基準を満たす候補はありませんでした</p>
        ) : (
          <div className="space-y-2">
            {candidates.map((c, i) => (
              <div
                key={i}
                className="border border-gray-100 rounded-lg p-3 flex items-start gap-3 text-sm"
              >
                <div className="flex-1">
                  <p className="font-medium">
                    {c.a.name}({c.a.company ?? "-"}) × {c.b.name}({c.b.company ?? "-"})
                  </p>
                  <p className="text-gray-500 text-xs mt-1">{c.reason}</p>
                </div>
                <button
                  onClick={() => adopt(c)}
                  className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs"
                >
                  採用(打診文を生成)
                </button>
                <button
                  onClick={() => reject(c)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs"
                >
                  却下
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        {FLOW.map((status) => (
          <div key={status} className="bg-white border border-gray-200 rounded-xl p-3">
            <h3 className="text-xs font-semibold text-gray-500 mb-2">
              {INTRO_STATUS_LABELS[status]} (
              {intros.filter((i) => i.status === status).length})
            </h3>
            <div className="space-y-2">
              {intros
                .filter((i) => i.status === status)
                .map((intro) => (
                  <div
                    key={intro.id}
                    className="border border-gray-100 rounded-lg p-2.5 text-xs space-y-1.5"
                  >
                    <p className="font-medium text-sm">
                      {intro.friend_a?.name} × {intro.friend_b?.name}
                    </p>
                    {intro.reason && <p className="text-gray-400">{intro.reason}</p>}
                    {status !== "completed" && (
                      <button
                        onClick={() => advance(intro)}
                        className="px-2 py-1 border border-gray-300 rounded-md text-gray-600 hover:text-gray-900"
                      >
                        {INTRO_STATUS_LABELS[FLOW[FLOW.indexOf(status) + 1]]}へ進める
                      </button>
                    )}
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
