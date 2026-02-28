"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Seed } from "@/types";

type Tab = "service_ideas" | "pest" | "jobs" | "all";

export default function SeedsPage() {
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");

  useEffect(() => {
    fetch("/api/seeds")
      .then((r) => r.json())
      .then((data) => {
        setSeeds(data);
        setLoading(false);
      });
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">タネ一覧</h1>
          <p className="text-xs text-gray-400">{seeds.length} 件のタネ</p>
        </div>
        <Link
          href="/"
          className="text-sm text-gray-400 hover:text-gray-900 underline underline-offset-2 transition-colors"
        >
          チャットに戻る
        </Link>
      </div>

      <div className="flex gap-1 mb-6 border-b border-gray-100">
        {(
          [
            { key: "all", label: "すべて" },
            { key: "service_ideas", label: "サービス案" },
            { key: "pest", label: "PEST" },
            { key: "jobs", label: "Jobs" },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
              tab === key
                ? "text-gray-900 border-gray-900"
                : "text-gray-400 border-transparent hover:text-gray-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">読み込み中...</p>
      ) : seeds.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p>まだタネがありません</p>
          <Link href="/" className="text-sm underline mt-2 inline-block hover:text-gray-600">
            最初のタネを入力する
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {seeds.map((seed) => (
            <SeedCard key={seed.id} seed={seed} tab={tab} />
          ))}
        </div>
      )}
    </div>
  );
}

function SeedCard({ seed, tab }: { seed: Seed; tab: Tab }) {
  const date = new Date(seed.created_at).toLocaleDateString("ja-JP", {
    month: "short",
    day: "numeric",
  });

  return (
    <div className="border border-gray-200 rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm font-medium text-gray-900 flex-1 leading-relaxed pr-4">
          {seed.raw_input}
        </p>
        <span className="text-xs text-gray-300 flex-shrink-0">{date}</span>
      </div>

      {seed.tags && (
        <div className="flex flex-wrap gap-1 mb-3">
          {seed.tags.map((tag) => (
            <span key={tag} className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
              {tag}
            </span>
          ))}
        </div>
      )}

      {(tab === "all" || tab === "service_ideas") && seed.service_ideas && (
        <div className="mt-3">
          <div className="text-xs font-semibold text-gray-400 mb-2">サービス案</div>
          <div className="space-y-2">
            {seed.service_ideas.map((s, i) => (
              <div key={i} className="bg-gray-50 rounded-xl p-3">
                <div className="text-xs font-medium text-gray-800">{s.name}</div>
                <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">{s.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(tab === "all" || tab === "pest") && seed.pest && (
        <div className="mt-3">
          <div className="text-xs font-semibold text-gray-400 mb-2">PEST</div>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { key: "political", label: "P" },
                { key: "economic", label: "E" },
                { key: "social", label: "S" },
                { key: "technological", label: "T" },
              ] as const
            ).map(({ key, label }) => (
              <div key={key} className="bg-gray-50 rounded-xl p-2.5">
                <div className="text-xs font-semibold text-gray-400 mb-0.5">{label}</div>
                <div className="text-xs text-gray-700 leading-relaxed">{seed.pest![key]}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(tab === "all" || tab === "jobs") && seed.jobs && (
        <div className="mt-3">
          <div className="text-xs font-semibold text-gray-400 mb-2">Jobs</div>
          <div className="space-y-1.5">
            {(
              [
                { key: "functional", label: "機能" },
                { key: "emotional", label: "感情" },
                { key: "social", label: "社会" },
              ] as const
            ).map(({ key, label }) => (
              <div key={key} className="flex gap-2 text-xs">
                <span className="text-gray-400 w-8 flex-shrink-0">{label}</span>
                <span className="text-gray-700">{seed.jobs![key].join("、")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
