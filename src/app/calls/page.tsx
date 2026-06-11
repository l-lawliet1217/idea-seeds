"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CallList, Content, Segment } from "@/types";

export default function CallListsPage() {
  const [lists, setLists] = useState<CallList[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [scripts, setScripts] = useState<Content[]>([]);
  const [name, setName] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const [minScore, setMinScore] = useState(60);
  const [scriptId, setScriptId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const data = await fetch("/api/call-lists").then((r) => r.json());
    if (Array.isArray(data)) setLists(data);
  }, []);

  useEffect(() => {
    load();
    fetch("/api/segments")
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setSegments(data));
    fetch("/api/contents?type=call_script")
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setScripts(data));
  }, [load]);

  async function create() {
    if (!name.trim()) {
      setError("リスト名を入力してください");
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch("/api/call-lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        segment_id: segmentId || undefined,
        min_score: minScore,
        script_content_id: scriptId || undefined,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "作成に失敗しました");
      return;
    }
    setName("");
    load();
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">テレアポ</h1>

      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-end gap-3 text-sm">
        <h2 className="text-sm font-semibold w-full">
          架電リスト作成(連絡拒否・受注済み・失注は自動除外)
        </h2>
        <label className="space-y-1">
          <span className="text-xs text-gray-500 block">リスト名</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: 6月第2週 製造業"
            className="border border-gray-200 rounded-lg px-3 py-1.5"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-gray-500 block">セグメント</span>
          <select
            value={segmentId}
            onChange={(e) => setSegmentId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
          >
            <option value="">全セグメント</option>
            {segments.map((seg) => (
              <option key={seg.id} value={seg.id}>
                {seg.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-gray-500 block">最低スコア</span>
          <input
            type="number"
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className="w-24 border border-gray-200 rounded-lg px-3 py-1.5"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-gray-500 block">使用スクリプト</span>
          <select
            value={scriptId}
            onChange={(e) => setScriptId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 bg-white max-w-60"
          >
            <option value="">なし</option>
            {scripts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={create}
          disabled={busy}
          className="px-4 py-1.5 bg-gray-900 text-white rounded-lg disabled:opacity-40"
        >
          {busy ? "作成中..." : "リスト作成"}
        </button>
        {error && <p className="text-red-600 w-full">{error}</p>}
        <p className="text-xs text-gray-400 w-full">
          スクリプトは コンテンツ &gt; 架電スクリプト で生成できます
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs">
            <tr>
              <th className="text-left px-4 py-2 font-medium">リスト名</th>
              <th className="text-left px-4 py-2 font-medium">セグメント</th>
              <th className="text-right px-4 py-2 font-medium">件数</th>
              <th className="text-left px-4 py-2 font-medium">作成日</th>
            </tr>
          </thead>
          <tbody>
            {lists.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                  架電リストがありません
                </td>
              </tr>
            )}
            {lists.map((list) => (
              <tr key={list.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link
                    href={`/calls/${list.id}`}
                    className="hover:underline underline-offset-2"
                  >
                    {list.name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-gray-500">
                  {list.segments?.name ?? "全セグメント"}
                </td>
                <td className="px-4 py-2 text-right text-gray-500">
                  {list.call_list_items?.[0]?.count ?? 0}
                </td>
                <td className="px-4 py-2 text-gray-400 text-xs">
                  {new Date(list.created_at).toLocaleDateString("ja-JP")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
