"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import CompaniesNav from "./companies-nav";
import {
  Company,
  CompanyStatus,
  COMPANY_STATUS_LABELS,
  Segment,
} from "@/types";

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [segmentId, setSegmentId] = useState("");
  const [status, setStatus] = useState("");
  const [excludeDnc, setExcludeDnc] = useState(true);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [scoreMessage, setScoreMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (segmentId) params.set("segment_id", segmentId);
    if (status) params.set("status", status);
    if (excludeDnc) params.set("exclude_dnc", "true");
    if (q) params.set("q", q);
    const data = await fetch(`/api/companies?${params}`).then((r) => r.json());
    if (Array.isArray(data)) setCompanies(data);
    setLoading(false);
  }, [segmentId, status, excludeDnc, q]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/segments")
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setSegments(data));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">企業管理</h1>
        <div className="flex items-center gap-2">
          {scoreMessage && (
            <span className="text-xs text-gray-500">{scoreMessage}</span>
          )}
          <button
            onClick={async () => {
              setScoring(true);
              setScoreMessage("");
              const res = await fetch("/api/companies/score-batch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  limit: 10,
                  segment_id: segmentId || undefined,
                }),
              });
              const data = await res.json();
              setScoring(false);
              setScoreMessage(
                res.ok
                  ? `${data.scored}件採点(残り${data.remaining}件)`
                  : (data.error ?? "採点に失敗しました")
              );
              load();
            }}
            disabled={scoring}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-40"
          >
            {scoring ? "採点中..." : "未採点を一括採点(10件)"}
          </button>
          <Link
            href="/companies/import"
            className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm"
          >
            gBizINFOから取り込み
          </Link>
        </div>
      </div>
      <CompaniesNav />

      <div className="flex flex-wrap gap-3 items-center bg-white border border-gray-200 rounded-xl p-3 text-sm">
        <select
          value={segmentId}
          onChange={(e) => setSegmentId(e.target.value)}
          className="border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
        >
          <option value="">全セグメント</option>
          {segments.map((seg) => (
            <option key={seg.id} value={seg.id}>
              {seg.name}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
        >
          <option value="">全ステータス</option>
          {Object.entries(COMPANY_STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-gray-600">
          <input
            type="checkbox"
            checked={excludeDnc}
            onChange={(e) => setExcludeDnc(e.target.checked)}
          />
          連絡拒否を除外
        </label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="企業名で検索"
          className="border border-gray-200 rounded-lg px-3 py-1.5 flex-1 min-w-40"
        />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium">企業名</th>
              <th className="text-left px-4 py-2.5 font-medium">セグメント</th>
              <th className="text-right px-4 py-2.5 font-medium">従業員</th>
              <th className="text-right px-4 py-2.5 font-medium">スコア</th>
              <th className="text-left px-4 py-2.5 font-medium">ステータス</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  読み込み中...
                </td>
              </tr>
            )}
            {!loading && companies.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  企業がありません。取り込みから始めてください。
                </td>
              </tr>
            )}
            {!loading &&
              companies.map((c) => (
                <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/companies/${c.id}`}
                      className="text-gray-900 hover:underline underline-offset-2"
                    >
                      {c.name}
                    </Link>
                    {c.do_not_contact && (
                      <span className="ml-2 text-xs text-red-500">連絡拒否</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">
                    {c.segments?.name ?? "-"}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-500">
                    {c.employees ?? "-"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {c.budget_score !== null ? (
                      <span title={c.budget_score_reason ?? ""}>
                        {c.budget_score}
                      </span>
                    ) : (
                      <span className="text-gray-300">未採点</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={c.status} />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: CompanyStatus }) {
  const colors: Record<CompanyStatus, string> = {
    candidate: "bg-gray-100 text-gray-600",
    qualified: "bg-blue-50 text-blue-700",
    approaching: "bg-amber-50 text-amber-700",
    negotiating: "bg-purple-50 text-purple-700",
    client: "bg-green-50 text-green-700",
    lost: "bg-gray-100 text-gray-400",
    excluded: "bg-gray-100 text-gray-400",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${colors[status]}`}>
      {COMPANY_STATUS_LABELS[status]}
    </span>
  );
}
