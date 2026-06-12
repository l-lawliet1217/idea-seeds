"use client";

import { useCallback, useEffect, useState } from "react";
import CompaniesNav from "../companies-nav";
import { BusinessModel, Industry, Segment } from "@/types";

export default function SegmentsPage() {
  const [businessModels, setBusinessModels] = useState<BusinessModel[]>([]);
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [bmId, setBmId] = useState("");
  const [indId, setIndId] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [bm, ind, seg] = await Promise.all([
      fetch("/api/business-models").then((r) => r.json()),
      fetch("/api/industries").then((r) => r.json()),
      fetch("/api/segments").then((r) => r.json()),
    ]);
    if (Array.isArray(bm)) setBusinessModels(bm);
    if (Array.isArray(ind)) setIndustries(ind);
    if (Array.isArray(seg)) setSegments(seg);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!bmId || !indId) return;
    setError("");
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

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">企業管理</h1>
      <CompaniesNav />
      {error && <p className="text-sm text-red-600">{error}</p>}

      <form
        onSubmit={create}
        className="bg-white border border-gray-200 rounded-xl p-3 flex gap-2 items-center text-sm"
      >
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
        <span className="text-gray-400">×</span>
        <select
          value={indId}
          onChange={(e) => setIndId(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
        >
          <option value="">特化先を選択</option>
          {industries.map((ind) => (
            <option key={ind.id} value={ind.id}>
              {ind.name}
            </option>
          ))}
        </select>
        <button className="px-4 py-1.5 bg-gray-900 text-white rounded-lg">
          セグメント作成
        </button>
        <span className="text-xs text-gray-400">
          ビジネスモデル・特化先のマスタは左のタブで管理
        </span>
      </form>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
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
