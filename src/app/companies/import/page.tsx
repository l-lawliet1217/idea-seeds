"use client";

import { useEffect, useState } from "react";
import CompaniesNav from "../companies-nav";
import { ImportCandidate, Segment } from "@/types";

export default function ImportPage() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [segmentId, setSegmentId] = useState("");
  const [businessItem, setBusinessItem] = useState("");
  const [prefecture, setPrefecture] = useState("");
  const [employeeFrom, setEmployeeFrom] = useState("");
  const [employeeTo, setEmployeeTo] = useState("");
  const [pages, setPages] = useState(1);

  const [candidates, setCandidates] = useState<ImportCandidate[] | null>(null);
  const [duplicates, setDuplicates] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/segments")
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setSegments(data));
  }, []);

  async function run(dryRun: boolean) {
    if (!segmentId) {
      setError("セグメントを選択してください");
      return;
    }
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/companies/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segment_id: segmentId,
          dry_run: dryRun,
          pages,
          search: {
            business_item: businessItem || undefined,
            prefecture: prefecture || undefined,
            employee_number_from: employeeFrom || undefined,
            employee_number_to: employeeTo || undefined,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "取り込みに失敗しました");

      if (dryRun) {
        setCandidates(data.candidates);
        setDuplicates(data.duplicates);
      } else {
        setCandidates(null);
        setMessage(
          `${data.inserted}件を取り込みました(重複除外: ${data.duplicates}件)`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-xl font-semibold">企業取り込み(gBizINFO)</h1>
      <CompaniesNav />

      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-xs text-gray-500">取り込み先セグメント(必須)</span>
            <select
              value={segmentId}
              onChange={(e) => setSegmentId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-white"
            >
              <option value="">選択してください</option>
              {segments.map((seg) => (
                <option key={seg.id} value={seg.id}>
                  {seg.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-gray-500">業種コード</span>
            <input
              value={businessItem}
              onChange={(e) => setBusinessItem(e.target.value)}
              placeholder="gBizINFOの業種コード"
              className="w-full border border-gray-200 rounded-lg px-3 py-2"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-gray-500">都道府県コード(JIS 2桁)</span>
            <input
              value={prefecture}
              onChange={(e) => setPrefecture(e.target.value)}
              placeholder="例: 東京都=13"
              className="w-full border border-gray-200 rounded-lg px-3 py-2"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-xs text-gray-500">従業員数(下限)</span>
              <input
                value={employeeFrom}
                onChange={(e) => setEmployeeFrom(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-gray-500">従業員数(上限)</span>
              <input
                value={employeeTo}
                onChange={(e) => setEmployeeTo(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2"
              />
            </label>
          </div>
          <label className="space-y-1">
            <span className="text-xs text-gray-500">取得ページ数(1ページ最大100件)</span>
            <input
              type="number"
              min={1}
              max={5}
              value={pages}
              onChange={(e) => setPages(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2"
            />
          </label>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={() => run(true)}
            disabled={loading}
            className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-40"
          >
            {loading ? "検索中..." : "プレビュー"}
          </button>
          <button
            onClick={() => run(false)}
            disabled={loading || !candidates || candidates.length === 0}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg disabled:opacity-40"
          >
            取り込み実行
          </button>
        </div>
        {error && <p className="text-red-600">{error}</p>}
        {message && <p className="text-green-700">{message}</p>}
      </div>

      {candidates && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 text-sm text-gray-500 border-b border-gray-100">
            検索結果: {candidates.length}件(既存との重複 {duplicates}件は除外済み)
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="text-left px-4 py-2 font-medium">企業名</th>
                <th className="text-left px-4 py-2 font-medium">所在地</th>
                <th className="text-right px-4 py-2 font-medium">従業員</th>
                <th className="text-left px-4 py-2 font-medium">法人番号</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.corporate_number} className="border-t border-gray-100">
                  <td className="px-4 py-2">{c.name}</td>
                  <td className="px-4 py-2 text-gray-500">{c.prefecture ?? "-"}</td>
                  <td className="px-4 py-2 text-right text-gray-500">
                    {c.employees ?? "-"}
                  </td>
                  <td className="px-4 py-2 text-gray-400 text-xs">
                    {c.corporate_number}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
