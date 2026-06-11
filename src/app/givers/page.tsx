"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FRIEND_TIERS, FriendTier, GiverFriend } from "@/types";

function daysAgo(date: string | null): string {
  if (!date) return "—";
  const diff = Math.floor(
    (Date.now() - new Date(date).getTime()) / (24 * 3600 * 1000)
  );
  if (diff <= 0) return "今日";
  return `${diff}日前`;
}

function isOverdue(friend: GiverFriend): boolean {
  return (
    !!friend.next_contact_date &&
    friend.next_contact_date <= new Date().toISOString().slice(0, 10)
  );
}

export default function GiversPage() {
  const [friends, setFriends] = useState<GiverFriend[]>([]);
  const [tier, setTier] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    company: "",
    position: "",
    industry: "",
    tier: "T3" as FriendTier,
  });

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (tier) params.set("tier", tier);
    if (overdue) params.set("overdue", "true");
    if (q) params.set("q", q);
    const data = await fetch(`/api/givers/friends?${params}`).then((r) => r.json());
    if (Array.isArray(data)) setFriends(data);
  }, [tier, overdue, q]);

  useEffect(() => {
    load();
  }, [load]);

  async function addFriend(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/givers/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "登録に失敗しました");
      return;
    }
    setForm({ name: "", company: "", position: "", industry: "", tier: "T3" });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">GiversNetwork</h1>
        <span className="text-sm text-gray-400">Friends ({friends.length}名)</span>
      </div>

      <form
        onSubmit={addFriend}
        className="bg-white border border-gray-200 rounded-xl p-3 flex flex-wrap gap-2 text-sm items-center"
      >
        <input
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="氏名(必須)"
          className="border border-gray-200 rounded-lg px-3 py-1.5 w-36"
        />
        <input
          value={form.company}
          onChange={(e) => setForm({ ...form, company: e.target.value })}
          placeholder="会社"
          className="border border-gray-200 rounded-lg px-3 py-1.5 w-44"
        />
        <input
          value={form.position}
          onChange={(e) => setForm({ ...form, position: e.target.value })}
          placeholder="役職"
          className="border border-gray-200 rounded-lg px-3 py-1.5 w-36"
        />
        <input
          value={form.industry}
          onChange={(e) => setForm({ ...form, industry: e.target.value })}
          placeholder="業界"
          className="border border-gray-200 rounded-lg px-3 py-1.5 w-36"
        />
        <select
          value={form.tier}
          onChange={(e) => setForm({ ...form, tier: e.target.value as FriendTier })}
          className="border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
        >
          {FRIEND_TIERS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button className="px-3 py-1.5 bg-gray-900 text-white rounded-lg">追加</button>
        {error && <span className="text-red-600">{error}</span>}
      </form>

      <div className="flex flex-wrap gap-2 items-center text-sm">
        <button
          onClick={() => setTier("")}
          className={`px-3 py-1 rounded-full border ${
            tier === "" ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-500 border-gray-200"
          }`}
        >
          全
        </button>
        {FRIEND_TIERS.map((t) => (
          <button
            key={t}
            onClick={() => setTier(t)}
            className={`px-3 py-1 rounded-full border ${
              tier === t
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-500 border-gray-200"
            }`}
          >
            {t}
          </button>
        ))}
        <label className="flex items-center gap-1.5 text-gray-600 ml-2">
          <input
            type="checkbox"
            checked={overdue}
            onChange={(e) => setOverdue(e.target.checked)}
          />
          接触遅延のみ
        </label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="氏名・会社・業界・メモで検索"
          className="border border-gray-200 rounded-lg px-3 py-1.5 flex-1 min-w-48"
        />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium">Tier</th>
              <th className="text-left px-4 py-2.5 font-medium">氏名</th>
              <th className="text-left px-4 py-2.5 font-medium">会社 / 役職</th>
              <th className="text-left px-4 py-2.5 font-medium">業界</th>
              <th className="text-left px-4 py-2.5 font-medium">次回接触</th>
              <th className="text-left px-4 py-2.5 font-medium">最終接触</th>
            </tr>
          </thead>
          <tbody>
            {friends.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  まだ登録がありません
                </td>
              </tr>
            )}
            {friends.map((f) => (
              <tr key={f.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium">
                    {f.tier}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <Link
                    href={`/givers/${f.id}`}
                    className="hover:underline underline-offset-2"
                  >
                    {f.name}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-gray-500">
                  {[f.company, f.position].filter(Boolean).join(" ") || "-"}
                </td>
                <td className="px-4 py-2.5 text-gray-500">{f.industry ?? "-"}</td>
                <td className="px-4 py-2.5">
                  {f.next_contact_date ? (
                    <span className={isOverdue(f) ? "text-red-600 font-medium" : ""}>
                      {new Date(f.next_contact_date).toLocaleDateString("ja-JP")}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2.5 text-gray-500">
                  {daysAgo(f.last_contact_date)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
