"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { FRIEND_TIERS, GiverContactLog, GiverFriend } from "@/types";

type FriendDetail = GiverFriend & { contact_logs: GiverContactLog[] };

export default function FriendDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [friend, setFriend] = useState<FriendDetail | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [log, setLog] = useState({
    contacted_at: new Date().toISOString().slice(0, 10),
    channel: "meeting",
    memo: "",
    next_contact_date: "",
  });

  const load = useCallback(async () => {
    const res = await fetch(`/api/givers/friends/${id}`);
    if (res.ok) setFriend(await res.json());
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(body: Record<string, unknown>) {
    setError("");
    setMessage("");
    const res = await fetch(`/api/givers/friends/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "更新に失敗しました");
      return;
    }
    setMessage("保存しました");
    load();
  }

  async function recordContact(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    const res = await fetch(`/api/givers/friends/${id}/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(log),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "記録に失敗しました");
      return;
    }
    setLog({ ...log, memo: "", next_contact_date: "" });
    setMessage("接触を記録しました");
    load();
  }

  async function remove() {
    if (!confirm(`${friend?.name} を削除しますか?`)) return;
    await fetch(`/api/givers/friends/${id}`, { method: "DELETE" });
    router.push("/givers");
  }

  if (!friend) return <p className="text-sm text-gray-400">読み込み中...</p>;

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">{friend.name}</h1>
        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium">
          {friend.tier}
        </span>
        <button
          onClick={remove}
          className="ml-auto text-xs text-red-500 hover:text-red-700"
        >
          削除
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-green-700">{message}</p>}

      <div className="grid md:grid-cols-2 gap-5">
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 text-sm">
          <h2 className="text-sm font-semibold">プロフィール</h2>
          <Field label="会社" value={friend.company ?? ""} onSave={(v) => patch({ company: v })} />
          <Field label="役職" value={friend.position ?? ""} onSave={(v) => patch({ position: v })} />
          <Field label="業界" value={friend.industry ?? ""} onSave={(v) => patch({ industry: v })} />
          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-xs w-16">Tier</span>
            <select
              value={friend.tier}
              onChange={(e) => patch({ tier: e.target.value })}
              className="border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
            >
              {FRIEND_TIERS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <Field
            label="誕生日"
            type="date"
            value={friend.birthday ?? ""}
            onSave={(v) => patch({ birthday: v })}
          />
          <Field
            label="次回接触"
            type="date"
            value={friend.next_contact_date ?? ""}
            onSave={(v) => patch({ next_contact_date: v })}
          />
          <NotesField value={friend.notes ?? ""} onSave={(v) => patch({ notes: v })} />
        </div>

        <div className="space-y-5">
          <form
            onSubmit={recordContact}
            className="bg-white border border-gray-200 rounded-xl p-4 space-y-2 text-sm"
          >
            <h2 className="text-sm font-semibold">接触を記録</h2>
            <div className="flex gap-2">
              <input
                type="date"
                value={log.contacted_at}
                onChange={(e) => setLog({ ...log, contacted_at: e.target.value })}
                className="border border-gray-200 rounded-lg px-3 py-1.5"
              />
              <select
                value={log.channel}
                onChange={(e) => setLog({ ...log, channel: e.target.value })}
                className="border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
              >
                <option value="meeting">対面</option>
                <option value="call">電話</option>
                <option value="message">メッセージ</option>
                <option value="event">イベント</option>
              </select>
            </div>
            <input
              value={log.memo}
              onChange={(e) => setLog({ ...log, memo: e.target.value })}
              placeholder="メモ"
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5"
            />
            <div className="flex gap-2 items-center">
              <span className="text-xs text-gray-500">次回予定:</span>
              <input
                type="date"
                value={log.next_contact_date}
                onChange={(e) =>
                  setLog({ ...log, next_contact_date: e.target.value })
                }
                className="border border-gray-200 rounded-lg px-3 py-1.5"
              />
              <button className="ml-auto px-3 py-1.5 bg-gray-900 text-white rounded-lg">
                記録
              </button>
            </div>
          </form>

          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h2 className="text-sm font-semibold mb-3">接触履歴</h2>
            {friend.contact_logs.length === 0 ? (
              <p className="text-sm text-gray-400">まだ記録がありません</p>
            ) : (
              <ul className="space-y-2">
                {friend.contact_logs.map((c) => (
                  <li key={c.id} className="flex gap-3 text-sm">
                    <span className="text-xs text-gray-400 w-24 flex-shrink-0 pt-0.5">
                      {new Date(c.contacted_at).toLocaleDateString("ja-JP")}
                    </span>
                    <span className="text-xs text-gray-400 w-16 flex-shrink-0 pt-0.5">
                      {c.channel ?? ""}
                    </span>
                    <span className="text-gray-700">{c.memo ?? ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onSave,
  type = "text",
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  type?: string;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <div className="flex items-center gap-3">
      <span className="text-gray-400 text-xs w-16 flex-shrink-0">{label}</span>
      <input
        type={type}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== value && onSave(v)}
        className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5"
      />
    </div>
  );
}

function NotesField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <div className="space-y-1">
      <span className="text-gray-400 text-xs">メモ</span>
      <textarea
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== value && onSave(v)}
        rows={4}
        className="w-full border border-gray-200 rounded-lg px-3 py-2"
      />
    </div>
  );
}
