"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Content,
  CONTENT_STATUS_LABELS,
  CONTENT_TYPE_LABELS,
} from "@/types";

export default function ContentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [content, setContent] = useState<Content | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/contents/${id}`);
    if (res.ok) {
      const data = await res.json();
      setContent(data);
      setTitle(data.title);
      setBody(data.body ?? "");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(patchBody: Record<string, unknown>, successMessage: string) {
    setBusy(true);
    setError("");
    setMessage("");
    const res = await fetch(`/api/contents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patchBody),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "更新に失敗しました");
      return;
    }
    setMessage(successMessage);
    load();
  }

  async function publish() {
    setBusy(true);
    setError("");
    setMessage("");
    const res = await fetch(`/api/contents/${id}/publish`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "公開に失敗しました");
      return;
    }
    setMessage("WordPressに公開しました");
    load();
  }

  if (!content) return <p className="text-sm text-gray-400">読み込み中...</p>;

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-3 text-sm">
        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
          {CONTENT_TYPE_LABELS[content.content_type]}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
          {CONTENT_STATUS_LABELS[content.status]}
        </span>
        <span className="text-gray-400 text-xs">
          {content.companies?.name ?? content.segments?.name ?? ""}
        </span>
        {content.published_url && (
          <a
            href={content.published_url}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 hover:underline text-xs"
          >
            公開ページを開く
          </a>
        )}
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-lg font-semibold bg-white"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={24}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono bg-white leading-relaxed"
      />

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-green-700">{message}</p>}

      <div className="flex flex-wrap gap-2 text-sm">
        <button
          onClick={() => patch({ title, body }, "保存しました")}
          disabled={busy}
          className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-40"
        >
          保存
        </button>
        {content.status === "draft" && (
          <button
            onClick={() => patch({ title, body, status: "in_review" }, "レビューに回しました")}
            disabled={busy}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg disabled:opacity-40"
          >
            レビューに回す
          </button>
        )}
        {content.status === "in_review" && (
          <>
            <button
              onClick={() => patch({ title, body, status: "approved" }, "承認しました")}
              disabled={busy}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg disabled:opacity-40"
            >
              承認する
            </button>
            <button
              onClick={() => patch({ status: "draft" }, "下書きに戻しました")}
              disabled={busy}
              className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-40"
            >
              下書きに戻す
            </button>
          </>
        )}
        {content.status === "approved" &&
          ["blog", "whitepaper", "proposal"].includes(content.content_type) && (
            <button
              onClick={publish}
              disabled={busy}
              className="px-4 py-2 bg-green-700 text-white rounded-lg disabled:opacity-40"
            >
              {busy ? "公開中..." : "WordPressに公開"}
            </button>
          )}
      </div>
    </div>
  );
}
