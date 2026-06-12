"use client";

import { useCallback, useEffect, useState } from "react";
import CompaniesNav from "../companies-nav";
import { BusinessModel, IndustryDatabase, Segment } from "@/types";

export default function SegmentsPage() {
  const [businessModels, setBusinessModels] = useState<BusinessModel[]>([]);
  const [databases, setDatabases] = useState<IndustryDatabase[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // 一括作成(データベース×ビジネスモデル)
  const [bulkBmId, setBulkBmId] = useState("");
  const [bulkDbId, setBulkDbId] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    const [bm, db, seg] = await Promise.all([
      fetch("/api/business-models").then((r) => r.json()),
      fetch("/api/industry-databases").then((r) => r.json()),
      fetch("/api/segments").then((r) => r.json()),
    ]);
    if (Array.isArray(bm)) setBusinessModels(bm);
    if (Array.isArray(db)) setDatabases(db);
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

  async function toggleResearchDone(seg: Segment) {
    setError("");
    const res = await fetch(`/api/segments/${seg.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ research_done: !seg.research_done }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "更新に失敗しました");
      return;
    }
    load();
  }

  async function removeSegment(seg: Segment) {
    if (!confirm(`「${seg.name}」を削除しますか?`)) return;
    setError("");
    setMessage("");
    const res = await fetch(`/api/segments/${seg.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "削除に失敗しました");
      return;
    }
    load();
  }

  const bulkDbCount = databases.find((d) => d.id === bulkDbId)?.industries?.[0]?.count;

  // 作成済みの組み合わせマトリクス: 特化先DB × ビジネスモデル → セグメント数/収集済み数
  const matrix = new Map<string, { count: number; done: number }>();
  for (const seg of segments) {
    const dbId = seg.industries?.database_id;
    if (!dbId) continue;
    const key = `${dbId}:${seg.business_model_id}`;
    const cell = matrix.get(key) ?? { count: 0, done: 0 };
    cell.count++;
    if (seg.research_done) cell.done++;
    matrix.set(key, cell);
  }

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
        <h2 className="text-sm font-semibold mb-1">作成済みの組み合わせ</h2>
        <p className="text-xs text-gray-400 mb-3">
          数字 = セグメント数(済 = 企業収集済みの数)。空欄のセルをクリックすると上の一括作成フォームにセットされます
        </p>
        <div className="overflow-x-auto">
          <table className="text-sm border-collapse">
            <thead>
              <tr>
                <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium border-b border-gray-200 whitespace-nowrap">
                  特化先DB ＼ ビジネスモデル
                </th>
                {businessModels.map((bm) => (
                  <th
                    key={bm.id}
                    className="px-3 py-2 text-xs text-gray-500 font-medium border-b border-gray-200 whitespace-nowrap"
                  >
                    {bm.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {databases.map((db) => (
                <tr key={db.id} className="border-b border-gray-100">
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap font-medium">
                    {db.name}
                    <span className="text-xs text-gray-400 ml-1">
                      ({db.industries?.[0]?.count ?? 0})
                    </span>
                  </td>
                  {businessModels.map((bm) => {
                    const cell = matrix.get(`${db.id}:${bm.id}`);
                    return (
                      <td key={bm.id} className="px-3 py-2 text-center">
                        {cell ? (
                          <span
                            className={`inline-block min-w-12 text-xs px-2 py-1 rounded-lg ${
                              cell.done === cell.count
                                ? "bg-green-50 text-green-700"
                                : cell.done > 0
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-blue-50 text-blue-700"
                            }`}
                            title={`セグメント${cell.count}件 / 企業収集済み${cell.done}件`}
                          >
                            {cell.count}
                            {cell.done > 0 && ` (済${cell.done})`}
                          </span>
                        ) : (
                          <button
                            onClick={() => {
                              setBulkDbId(db.id);
                              setBulkBmId(bm.id);
                            }}
                            className="text-gray-300 hover:text-gray-600 text-xs px-2 py-1"
                            title={`${db.name} × ${bm.name} を一括作成フォームにセット`}
                          >
                            —
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
              <th className="text-left px-4 py-2 font-medium">特化先DB</th>
              <th className="text-center px-4 py-2 font-medium">企業収集</th>
              <th className="text-right px-4 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {segments.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
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
                <td className="px-4 py-2 text-gray-500">
                  {seg.industries?.industry_databases?.name ?? "-"}
                </td>
                <td className="px-4 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={!!seg.research_done}
                    onChange={() => toggleResearchDone(seg)}
                    title="チェック済みのセグメントはAI企業リサーチの対象外になります"
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => removeSegment(seg)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
