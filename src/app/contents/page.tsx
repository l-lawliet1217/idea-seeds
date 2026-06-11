"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Company,
  Content,
  CONTENT_STATUS_LABELS,
  CONTENT_TYPE_LABELS,
  ContentType,
  Segment,
} from "@/types";

const GENERATABLE: ContentType[] = ["blog", "whitepaper", "proposal", "call_script"];

export default function ContentsPage() {
  const [contents, setContents] = useState<Content[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [genType, setGenType] = useState<ContentType>("blog");
  const [genSegmentId, setGenSegmentId] = useState("");
  const [genCompanyId, setGenCompanyId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (typeFilter) params.set("type", typeFilter);
    if (statusFilter) params.set("status", statusFilter);
    const data = await fetch(`/api/contents?${params}`).then((r) => r.json());
    if (Array.isArray(data)) setContents(data);
  }, [typeFilter, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/segments")
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setSegments(data));
    fetch("/api/companies?exclude_dnc=true")
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setCompanies(data));
  }, []);

  async function generate() {
    setError("");
    if (genType === "proposal" && !genCompanyId) {
      setError("提案書はターゲット企業の選択が必要です");
      return;
    }
    if (genType !== "proposal" && !genSegmentId) {
      setError("セグメントを選択してください");
      return;
    }
    setGenerating(true);
    const res = await fetch("/api/contents/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content_type: genType,
        segment_id: genSegmentId || undefined,
        company_id: genCompanyId || undefined,
      }),
    });
    const data = await res.json();
    setGenerating(false);
    if (!res.ok) {
      setError(data.error ?? "生成に失敗しました");
      return;
    }
    load();
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">コンテンツ</h1>

      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-end gap-3 text-sm">
        <h2 className="text-sm font-semibold w-full">新規生成(下書きとして保存されます)</h2>
        <label className="space-y-1">
          <span className="text-xs text-gray-500 block">種別</span>
          <select
            value={genType}
            onChange={(e) => setGenType(e.target.value as ContentType)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
          >
            {GENERATABLE.map((t) => (
              <option key={t} value={t}>
                {CONTENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-gray-500 block">セグメント</span>
          <select
            value={genSegmentId}
            onChange={(e) => setGenSegmentId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
          >
            <option value="">選択</option>
            {segments.map((seg) => (
              <option key={seg.id} value={seg.id}>
                {seg.name}
              </option>
            ))}
          </select>
        </label>
        {genType === "proposal" && (
          <label className="space-y-1">
            <span className="text-xs text-gray-500 block">ターゲット企業</span>
            <select
              value={genCompanyId}
              onChange={(e) => setGenCompanyId(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 bg-white max-w-60"
            >
              <option value="">選択</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          onClick={generate}
          disabled={generating}
          className="px-4 py-1.5 bg-gray-900 text-white rounded-lg disabled:opacity-40"
        >
          {generating ? "生成中(1-2分かかります)..." : "Claudeで生成"}
        </button>
        {error && <p className="text-red-600 w-full">{error}</p>}
      </div>

      <div className="flex gap-3 text-sm">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
        >
          <option value="">全種別</option>
          {Object.entries(CONTENT_TYPE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
        >
          <option value="">全ステータス</option>
          {Object.entries(CONTENT_STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs">
            <tr>
              <th className="text-left px-4 py-2 font-medium">タイトル</th>
              <th className="text-left px-4 py-2 font-medium">種別</th>
              <th className="text-left px-4 py-2 font-medium">対象</th>
              <th className="text-left px-4 py-2 font-medium">ステータス</th>
              <th className="text-left px-4 py-2 font-medium">作成日</th>
            </tr>
          </thead>
          <tbody>
            {contents.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                  コンテンツがありません
                </td>
              </tr>
            )}
            {contents.map((c) => (
              <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link
                    href={`/contents/${c.id}`}
                    className="hover:underline underline-offset-2"
                  >
                    {c.title}
                  </Link>
                </td>
                <td className="px-4 py-2 text-gray-500">
                  {CONTENT_TYPE_LABELS[c.content_type]}
                </td>
                <td className="px-4 py-2 text-gray-500">
                  {c.companies?.name ?? c.segments?.name ?? "-"}
                </td>
                <td className="px-4 py-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {CONTENT_STATUS_LABELS[c.status]}
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-400 text-xs">
                  {new Date(c.created_at).toLocaleDateString("ja-JP")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
