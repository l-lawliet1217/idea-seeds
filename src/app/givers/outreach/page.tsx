"use client";

import { useCallback, useEffect, useState } from "react";
import GiversNav from "../givers-nav";
import {
  GiverFriend,
  GiverOutreach,
  OUTREACH_KIND_LABELS,
  OutreachKind,
} from "@/types";

export default function OutreachPage() {
  const [items, setItems] = useState<GiverOutreach[]>([]);
  const [friends, setFriends] = useState<GiverFriend[]>([]);
  const [tab, setTab] = useState<"draft" | "sent">("draft");
  const [friendId, setFriendId] = useState("");
  const [kind, setKind] = useState<OutreachKind>("follow");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const data = await fetch(`/api/givers/outreach?status=${tab}`).then((r) =>
      r.json()
    );
    if (Array.isArray(data)) setItems(data);
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/givers/friends")
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setFriends(data));
  }, []);

  async function generate() {
    if (!friendId) {
      setError("友人を選択してください");
      return;
    }
    setGenerating(true);
    setError("");
    const res = await fetch("/api/givers/outreach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ friend_id: friendId, kind }),
    });
    const data = await res.json();
    setGenerating(false);
    if (!res.ok) {
      setError(data.error ?? "生成に失敗しました");
      return;
    }
    setTab("draft");
    load();
  }

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch(`/api/givers/outreach/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/givers/outreach/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Outreach</h1>
      <GiversNav />
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap gap-2 items-center text-sm">
        <select
          value={friendId}
          onChange={(e) => setFriendId(e.target.value)}
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
          value={kind}
          onChange={(e) => setKind(e.target.value as OutreachKind)}
          className="border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
        >
          {Object.entries(OUTREACH_KIND_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <button
          onClick={generate}
          disabled={generating}
          className="px-3 py-1.5 bg-gray-900 text-white rounded-lg disabled:opacity-40"
        >
          {generating ? "生成中..." : "メッセージ生成"}
        </button>
        <span className="text-xs text-gray-400">
          紹介打診はMatchingの「採用」でも自動生成されます
        </span>
      </div>

      <div className="flex gap-1 text-sm">
        {(["draft", "sent"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setTab(s)}
            className={`px-4 py-1.5 rounded-lg border ${
              tab === s
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-500 border-gray-200"
            }`}
          >
            {s === "draft" ? "下書き" : "送信済み"}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {items.length === 0 && (
          <p className="text-sm text-gray-400">
            {tab === "draft" ? "下書きはありません" : "送信済みはありません"}
          </p>
        )}
        {items.map((item) => (
          <OutreachCard
            key={item.id}
            item={item}
            onSave={(message) => patch(item.id, { message })}
            onSent={() => patch(item.id, { status: "sent" })}
            onDelete={() => remove(item.id)}
          />
        ))}
      </div>
    </div>
  );
}

function OutreachCard({
  item,
  onSave,
  onSent,
  onDelete,
}: {
  item: GiverOutreach;
  onSave: (message: string) => void;
  onSent: () => void;
  onDelete: () => void;
}) {
  const [message, setMessage] = useState(item.message);
  const [copied, setCopied] = useState(false);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-medium">{item.givers_friends?.name}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
          {OUTREACH_KIND_LABELS[item.kind]}
        </span>
        <span className="text-xs text-gray-400 ml-auto">
          {new Date(item.created_at).toLocaleDateString("ja-JP")}
        </span>
      </div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={5}
        disabled={item.status === "sent"}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 leading-relaxed disabled:bg-gray-50 disabled:text-gray-500"
      />
      {item.status === "draft" && (
        <div className="flex gap-2">
          <button
            onClick={() => onSave(message)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs"
          >
            保存
          </button>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(message);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs"
          >
            {copied ? "コピーしました" : "コピー"}
          </button>
          <button
            onClick={onSent}
            className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs"
          >
            送信済みにする
          </button>
          <button
            onClick={onDelete}
            className="px-3 py-1.5 text-red-500 text-xs ml-auto"
          >
            削除
          </button>
        </div>
      )}
    </div>
  );
}
