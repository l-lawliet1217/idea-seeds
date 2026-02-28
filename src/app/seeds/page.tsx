"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Seed } from "@/types";

type Tab = "all" | "service_ideas" | "pest" | "jobs";

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

  async function handleDelete(id: string) {
    await fetch("/api/seeds", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setSeeds((prev) => prev.filter((s) => s.id !== id));
  }

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
            { key: "all", label: "全て" },
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
        <>
          {tab === "all" && <AllTab seeds={seeds} onDelete={handleDelete} />}
          {tab === "service_ideas" && <ServiceTab seeds={seeds} />}
          {tab === "pest" && <PestTab seeds={seeds} />}
          {tab === "jobs" && <JobsTab seeds={seeds} />}
        </>
      )}
    </div>
  );
}

// 全て: 送ったメッセージをシンプルに一覧
function AllTab({ seeds, onDelete }: { seeds: Seed[]; onDelete: (id: string) => void }) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  function handleDelete(id: string) {
    if (confirmId === id) {
      onDelete(id);
      setConfirmId(null);
    } else {
      setConfirmId(id);
    }
  }

  return (
    <div className="space-y-2">
      {seeds.map((seed) => {
        const date = new Date(seed.created_at).toLocaleDateString("ja-JP", {
          month: "short",
          day: "numeric",
        });
        return (
          <div
            key={seed.id}
            className="flex items-start justify-between border border-gray-100 rounded-xl bg-white px-4 py-3 hover:border-gray-200 transition-colors group"
          >
            <p className="text-sm text-gray-900 leading-relaxed flex-1 pr-4">{seed.raw_input}</p>
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-300">{date}</span>
                <button
                  onClick={() => handleDelete(seed.id)}
                  className={`text-xs px-2 py-0.5 rounded-lg transition-colors ${
                    confirmId === seed.id
                      ? "bg-red-100 text-red-500"
                      : "opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400"
                  }`}
                >
                  {confirmId === seed.id ? "本当に削除" : "削除"}
                </button>
              </div>
              {seed.tags && (
                <div className="flex flex-wrap gap-1 justify-end">
                  {seed.tags.slice(0, 2).map((tag) => (
                    <span key={tag} className="text-xs bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// サービス案: 全タネのサービス案をフラットに一覧
function ServiceTab({ seeds }: { seeds: Seed[] }) {
  const items = seeds.flatMap((seed) =>
    (seed.service_ideas ?? []).map((s) => ({ ...s, source: seed.raw_input }))
  );

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="border border-gray-100 rounded-xl bg-white px-4 py-3 hover:border-gray-200 transition-colors">
          <div className="text-sm font-medium text-gray-900">{item.name}</div>
          <div className="text-xs text-gray-600 mt-1 leading-relaxed">{item.description}</div>
          <div className="text-xs text-gray-400 mt-1">対象: {item.target}</div>
          <div className="text-xs text-gray-300 mt-2 border-t border-gray-50 pt-2">元: {item.source}</div>
        </div>
      ))}
    </div>
  );
}

// PEST: タネごとにPESTを表示
function PestTab({ seeds }: { seeds: Seed[] }) {
  return (
    <div className="space-y-4">
      {seeds.filter((s) => s.pest).map((seed) => (
        <div key={seed.id} className="border border-gray-100 rounded-xl bg-white p-4">
          <p className="text-xs text-gray-400 mb-3 leading-relaxed">{seed.raw_input}</p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { key: "political", label: "P（政治）" },
                { key: "economic", label: "E（経済）" },
                { key: "social", label: "S（社会）" },
                { key: "technological", label: "T（技術）" },
              ] as const
            ).map(({ key, label }) => (
              <div key={key} className="bg-gray-50 rounded-xl p-3">
                <div className="text-xs font-semibold text-gray-400 mb-1">{label}</div>
                <div className="text-xs text-gray-700 leading-relaxed">{seed.pest![key]}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Jobs: タネごとにJobs理論を表示
function JobsTab({ seeds }: { seeds: Seed[] }) {
  return (
    <div className="space-y-4">
      {seeds.filter((s) => s.jobs).map((seed) => (
        <div key={seed.id} className="border border-gray-100 rounded-xl bg-white p-4">
          <p className="text-xs text-gray-400 mb-3 leading-relaxed">{seed.raw_input}</p>
          <div className="space-y-2">
            {(
              [
                { key: "functional", label: "機能的ジョブ" },
                { key: "emotional", label: "感情的ジョブ" },
                { key: "social", label: "社会的ジョブ" },
              ] as const
            ).map(({ key, label }) => (
              <div key={key}>
                <div className="text-xs font-semibold text-gray-400 mb-1">{label}</div>
                <div className="flex flex-wrap gap-1">
                  {seed.jobs![key].map((job, i) => (
                    <span key={i} className="text-xs bg-gray-50 text-gray-700 border border-gray-100 px-2 py-1 rounded-lg">
                      {job}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
