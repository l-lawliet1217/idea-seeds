"use client";

import { useCallback, useEffect, useState } from "react";
import GiversNav from "../givers-nav";
import {
  GiverFriend,
  GiverTrigger,
  TRIGGER_STATUS_LABELS,
  TriggerStatus,
} from "@/types";

const TRIGGER_TYPES = [
  "資金調達",
  "採用",
  "新規事業",
  "メディア掲載",
  "移転",
  "イベント登壇",
  "その他",
];

export default function TriggersPage() {
  const [triggers, setTriggers] = useState<GiverTrigger[]>([]);
  const [friends, setFriends] = useState<GiverFriend[]>([]);
  const [tab, setTab] = useState<TriggerStatus>("open");
  const [form, setForm] = useState({ friend_id: "", trigger_type: "資金調達", content: "" });
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const data = await fetch("/api/givers/triggers").then((r) => r.json());
    if (Array.isArray(data)) setTriggers(data);
  }, []);

  useEffect(() => {
    load();
    fetch("/api/givers/friends")
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setFriends(data));
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/givers/triggers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "登録に失敗しました");
      return;
    }
    setForm({ ...form, content: "" });
    load();
  }

  async function setStatus(id: string, status: TriggerStatus) {
    await fetch(`/api/givers/triggers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  const visible = triggers.filter((t) => t.status === tab);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Triggers</h1>
      <GiversNav />
      {error && <p className="text-sm text-red-600">{error}</p>}

      <form
        onSubmit={add}
        className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap gap-2 items-center text-sm"
      >
        <select
          required
          value={form.friend_id}
          onChange={(e) => setForm({ ...form, friend_id: e.target.value })}
          className="border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
        >
          <option value="">友人を選択</option>
          {friends.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <select
          value={form.trigger_type}
          onChange={(e) => setForm({ ...form, trigger_type: e.target.value })}
          className="border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
        >
          {TRIGGER_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          required
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
          placeholder="内容(例: シリーズA調達を発表)"
          className="border border-gray-200 rounded-lg px-3 py-1.5 flex-1 min-w-48"
        />
        <button className="px-3 py-1.5 bg-gray-900 text-white rounded-lg">追加</button>
      </form>

      <div className="flex gap-1 text-sm">
        {(Object.keys(TRIGGER_STATUS_LABELS) as TriggerStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => setTab(s)}
            className={`px-4 py-1.5 rounded-lg border ${
              tab === s
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-500 border-gray-200"
            }`}
          >
            {TRIGGER_STATUS_LABELS[s]} ({triggers.filter((t) => t.status === s).length})
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {visible.length === 0 && (
          <p className="text-sm text-gray-400">該当するトリガーはありません</p>
        )}
        {visible.map((t) => (
          <div
            key={t.id}
            className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3 text-sm"
          >
            <span className="font-medium">{t.givers_friends?.name}</span>
            {t.trigger_type && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                {t.trigger_type}
              </span>
            )}
            <span className="text-gray-600 flex-1">{t.content}</span>
            <span className="text-xs text-gray-400">
              {new Date(t.created_at).toLocaleDateString("ja-JP")}
            </span>
            {t.status === "open" && (
              <button
                onClick={() => setStatus(t.id, "in_progress")}
                className="px-2.5 py-1 border border-gray-300 rounded-lg text-xs"
              >
                対応中へ
              </button>
            )}
            {t.status === "in_progress" && (
              <button
                onClick={() => setStatus(t.id, "done")}
                className="px-2.5 py-1 bg-gray-900 text-white rounded-lg text-xs"
              >
                対応済へ
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
