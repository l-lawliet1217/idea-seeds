"use client";

import { useCallback, useEffect, useState } from "react";
import CompaniesNav from "../companies-nav";
import { BusinessModel, Industry, IndustryDatabase, Segment } from "@/types";

export default function SegmentsPage() {
  const [businessModels, setBusinessModels] = useState<BusinessModel[]>([]);
  const [databases, setDatabases] = useState<IndustryDatabase[]>([]);
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // 一括作成(データベース×ビジネスモデル)
  const [bulkBmId, setBulkBmId] = useState("");
  const [bulkDbId, setBulkDbId] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  // 個別作成
  const [bmId, setBmId] = useState("");
  const [indId, setIndId] = useState("");

  const load = useCallback(async () => {
    const [bm, db, ind, seg] = await Promise.all([
      fetch("/api/business-models").then((r) => r.json()),
      fetch("/api/industry-databases").then((r) => r.json()),
      fetch("/api/industries").then((r) => r.json()),
      fetch("/api/segments").then((r) => r.json()),
    ]);
    if (Array.isArray(bm)) setBusinessModels(bm);
    if (Array.isArray(db)) setDatabases(db);
    if (Array.isArray(ind)) setIndustries(ind);
    if (Array.isArray(seg)) setSegments(seg);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function bulkCreate() {
    if (!bulkBmId || !bulkDbId) {
      setError("ビジネスモデルとデータベースを選択してください");
      return;
    }
    setBulkBusy(true);
    setError("");
    setMessage("");
    const res = await fetch("/api/segments/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ business_model_id: bulkBmId, database_id: bulkDbId }),
    });
    const data = await res.json();
    setBulkBusy(false);
    if (!res.ok) {
      setError(data.error ?? "一括作成に失敗しました");
      return;
    }
    setMessage(
      `${data.inserted}件のセグメントを作成しました(既存スキップ: ${data.skipped}件)`
    );
    load();
  }

  async function createSingle(e: React.FormEvent) {
    e.preventDefault();
    if (!bmId || !indId) return;
    setError("");
    setMessage("");
    const res = await fetch("/api/segments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ business_model_id: bmId, industry_id: indId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "作成に失敗しました");
      return;
    }
    setBmId("");
    setIndId("");
    load();
  }

  const bulkDbCount = databases.find((d) => d.id === bulkDbId)?.industries?.[0]?.count;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">企業管理</h1>
      <CompaniesNav />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-green-700">{message}</p>}

      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold">
          一括作成: データベース × ビジネスモデル
        </h2>
        <p className="text-xs text-gray-400">
          例: 「都道府県 × 特化型Eコマース」→ 北海道特化型Eコマース、青森特化型Eコマース…を全件作成
        </p>
        <div className="flex flex-wrap gap-2 items-center text-sm">
          <select
            value={bulkDbId}
            onChange={(e) => setBulkDbId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
          >
            <option value="">データベースを選択</option>
            {databases.map((db) => (
              <option key={db.id} value={db.id}>
                {db.name}({db.industries?.[0]?.count ?? 0}件)
              </option>
            ))}
          </select>
          <span className="text-gray-400">×</span>
          <select
            value={bulkBmId}
            onChange={(e) => setBulkBmId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
          >
            <option value="">ビジネスモデルを選択</option>
            {businessModels.map((bm) => (
              <option key={bm.id} value={bm.id}>
                {bm.name}
              </option>
            ))}
          </select>
          <button
            onClick={bulkCreate}
            disabled={bulkBusy}
            className="px-4 py-1.5 bg-gray-900 text-white rounded-lg disabled:opacity-40"
          >
            {bulkBusy
              ? "作成中..."
              : `一括作成${bulkDbCount ? `(最大${bulkDbCount}件)` : ""}`}
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold mb-3">個別作成</h2>
        <form onSubmit={createSingle} className="flex gap-2 items-center text-sm">
          <select
            value={indId}
            onChange={(e) => setIndId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 bg-white max-w-64"
          >
            <option value="">特化先を選択</option>
            {industries.map((ind) => (
              <option key={ind.id} value={ind.id}>
                {ind.name}
              </option>
            ))}
          </select>
          <span className="text-gray-400">×</span>
          <select
            value={bmId}
            onChange={(e) => setBmId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
          >
            <option value="">ビジネスモデルを選択</option>
            {businessModels.map((bm) => (
              <option key={bm.id} value={bm.id}>
                {bm.name}
              </option>
            ))}
          </select>
          <button className="px-4 py-1.5 border border-gray-300 rounded-lg">
            作成
          </button>
        </form>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 text-xs text-gray-500 border-b border-gray-100">
          セグメント({segments.length}件)
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs">
            <tr>
              <th className="text-left px-4 py-2 font-medium">セグメント</th>
              <th className="text-left px-4 py-2 font-medium">ビジネスモデル</th>
              <th className="text-left px-4 py-2 font-medium">特化先</th>
            </tr>
          </thead>
          <tbody>
            {segments.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-400">
                  セグメントが未作成です
                </td>
              </tr>
            )}
            {segments.map((seg) => (
              <tr key={seg.id} className="border-t border-gray-100">
                <td className="px-4 py-2 font-medium">{seg.name}</td>
                <td className="px-4 py-2 text-gray-500">
                  {seg.business_models?.name ?? "-"}
                </td>
                <td className="px-4 py-2 text-gray-500">
                  {seg.industries?.name ?? "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
