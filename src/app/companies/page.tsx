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

function formatNumber(v: number | null): string {
  if (v === null) return "-";
  if (v >= 100_000_000) return `${(v / 100_000_000).toLocaleString()}億円`;
  if (v >= 10_000) return `${(v / 10_000).toLocaleString()}万円`;
  return v.toLocaleString();
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);

  const [businessModelId, setBusinessModelId] = useState("");
  const [databaseId, setDatabaseId] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  const [researching, setResearching] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [monthUsd, setMonthUsd] = useState<number | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichMessage, setEnrichMessage] = useState("");

  const loadUsage = useCallback(async () => {
    const data = await fetch("/api/usage").then((r) => r.json()).catch(() => null);
    if (data && typeof data.month_usd === "number") setMonthUsd(data.month_usd);
  }, []);

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (businessModelId) params.set("business_model_id", businessModelId);
    if (databaseId) params.set("database_id", databaseId);
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    params.set("exclude_dnc", "true");
    const data = await fetch(`/api/companies?${params}`).then((r) => r.json());
    if (Array.isArray(data)) setCompanies(data);
    setLoading(false);
  }, [businessModelId, databaseId, status, q]);

  useEffect(() => {
    load();
  }, [load]);

  const loadSegments = useCallback(async () => {
    const data = await fetch("/api/segments").then((r) => r.json());
    if (Array.isArray(data)) setSegments(data);
  }, []);

  useEffect(() => {
    loadSegments();
  }, [loadSegments]);

  // セグメントから既存の「特化先DB×ビジネスモデル」の組み合わせを導出
  const combos = (() => {
    const map = new Map<
      string,
      { dbId: string; bmId: string; label: string; count: number }
    >();
    for (const seg of segments) {
      const dbId = seg.industries?.database_id;
      const bmId = seg.business_model_id;
      if (!dbId || !bmId) continue;
      const key = `${dbId}:${bmId}`;
      const existing = map.get(key);
      if (existing) {
        existing.count++;
      } else {
        const dbName = seg.industries?.industry_databases?.name ?? "?";
        const bmName = seg.business_models?.name ?? "?";
        map.set(key, { dbId, bmId, label: `${dbName} × ${bmName}`, count: 1 });
      }
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "ja"));
  })();

  const selectedComboKey =
    databaseId && businessModelId ? `${databaseId}:${businessModelId}` : "";

  function selectCombo(key: string) {
    if (!key) {
      setDatabaseId("");
      setBusinessModelId("");
      return;
    }
    const [dbId, bmId] = key.split(":");
    setDatabaseId(dbId);
    setBusinessModelId(bmId);
  }

  // 選択中のビジネスモデル×特化先DBに該当するセグメント
  const targetSegments = segments.filter(
    (seg) =>
      (!businessModelId || seg.business_model_id === businessModelId) &&
      (!databaseId || seg.industries?.database_id === databaseId)
  );

  async function research() {
    if (!businessModelId || !databaseId) {
      setError("特化先DB × ビジネスモデルを選択してください");
      return;
    }
    // 企業収集フラグが立っていないセグメントから順に、1回の実行で最大5セグメント調査
    const queue = targetSegments.filter((seg) => !seg.research_done).slice(0, 5);
    if (queue.length === 0) {
      setError(
        "未収集のセグメントがありません(全セグメント収集済み。再収集したい場合はセグメントタブの「企業収集」チェックを外してください)"
      );
      return;
    }

    setResearching(true);
    setError("");
    let total = 0;
    let runCost = 0;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    for (let i = 0; i < queue.length; i++) {
      const seg = queue[i];
      let done = false;
      for (let attempt = 0; attempt < 3 && !done; attempt++) {
        setProgress(
          `(${i + 1}/${queue.length}) ${seg.name} を調査中... 累計コスト $${runCost.toFixed(3)}`
        );
        try {
          const res = await fetch("/api/companies/research", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ segment_id: seg.id }),
          });
          const data = await res.json();
          if (res.ok) {
            total += data.inserted ?? 0;
            runCost += data.cost_usd ?? 0;
            done = true;
          } else if (/レート制限/.test(data.error ?? "") && attempt < 2) {
            // トークン上限(分単位)に当たった場合は待機して同じセグメントを再試行
            for (let s = 60; s > 0; s -= 5) {
              setProgress(
                `(${i + 1}/${queue.length}) ${seg.name}: レート制限のため${s}秒待機中...(自動で再開します)`
              );
              await sleep(5000);
            }
          } else {
            setError(data.error ?? "一部のセグメントで失敗しました");
            done = true;
          }
        } catch {
          setError("通信エラーが発生しました");
          done = true;
        }
      }
      load();
    }
    setProgress(
      `完了: ${queue.length}セグメントを調査し、${total}社を登録しました(今回のコスト: $${runCost.toFixed(3)})`
    );
    setResearching(false);
    load();
    loadUsage();
    loadSegments();
  }

  async function enrich() {
    setEnriching(true);
    setError("");
    setEnrichMessage("gBizINFOから取得中...(1社あたり1秒程度)");
    try {
      const res = await fetch("/api/companies/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_model_id: businessModelId || undefined,
          database_id: databaseId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "取得に失敗しました");
        setEnrichMessage("");
      } else {
        setEnrichMessage(
          `取得完了: ${data.updated}社を更新(該当なし: ${data.not_found}件、残り未処理: ${data.remaining}件)`
        );
        load();
      }
    } catch {
      setError("通信エラーが発生しました");
      setEnrichMessage("");
    }
    setEnriching(false);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">企業管理</h1>
      <CompaniesNav />
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            AI企業リサーチ(ビジネスモデル×特化先のサイトをWeb検索で発掘)
          </h2>
          {monthUsd !== null && (
            <span className="text-xs text-gray-400">
              今月のAI利用額: ${monthUsd.toFixed(2)}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2 items-center text-sm">
          <select
            value={selectedComboKey}
            onChange={(e) => selectCombo(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 bg-white max-w-96"
          >
            <option value="">特化先DB × ビジネスモデルを選択</option>
            {combos.map((combo) => (
              <option key={`${combo.dbId}:${combo.bmId}`} value={`${combo.dbId}:${combo.bmId}`}>
                {combo.label}({combo.count}セグメント)
              </option>
            ))}
          </select>
          <button
            onClick={research}
            disabled={researching || enriching}
            className="px-4 py-1.5 bg-gray-900 text-white rounded-lg disabled:opacity-40"
          >
            {researching ? "調査中..." : "AIで探して登録(5セグメントずつ)"}
          </button>
          <button
            onClick={enrich}
            disabled={researching || enriching}
            className="px-4 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40"
          >
            {enriching ? "取得中..." : "法人番号・従業員数・資本金を取得(無料)"}
          </button>
        </div>
        {progress && <p className="text-xs text-gray-500">{progress}</p>}
        {enrichMessage && <p className="text-xs text-gray-500">{enrichMessage}</p>}
        <p className="text-xs text-gray-400">
          AIリサーチはサイト名・URL・運営会社名の発見のみ(低コスト)。法人番号・従業員数・資本金は右のボタンでgBizINFO(経産省・無料)から補完します(一度に30社ずつ)
        </p>
      </div>

      <div className="flex flex-wrap gap-3 items-center bg-white border border-gray-200 rounded-xl p-3 text-sm">
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
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="企業名で検索"
          className="border border-gray-200 rounded-lg px-3 py-1.5 flex-1 min-w-40"
        />
        <span className="text-xs text-gray-400">
          上のビジネスモデル×特化先DBの選択が一覧の絞り込みにも効きます
        </span>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium">サイト/サービス</th>
              <th className="text-left px-4 py-2.5 font-medium">運営会社</th>
              <th className="text-right px-4 py-2.5 font-medium">社員数</th>
              <th className="text-right px-4 py-2.5 font-medium">資本金</th>
              <th className="text-left px-4 py-2.5 font-medium">代表電話</th>
              <th className="text-left px-4 py-2.5 font-medium">セグメント</th>
              <th className="text-left px-4 py-2.5 font-medium">ステータス</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  読み込み中...
                </td>
              </tr>
            )}
            {!loading && companies.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  企業がありません。上のAIリサーチから始めてください
                </td>
              </tr>
            )}
            {!loading &&
              companies.map((c) => (
                <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <div>{c.service_name ?? "-"}</div>
                    {c.service_url && (
                      <a
                        href={c.service_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-600 hover:underline"
                      >
                        {c.service_url.replace(/^https?:\/\//, "").slice(0, 40)}
                      </a>
                    )}
                  </td>
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
                  <td className="px-4 py-2.5 text-right text-gray-500">
                    {c.employees ?? "-"}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-500">
                    {formatNumber(c.capital_jpy)}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">{c.phone ?? "-"}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">
                    {c.segments?.name ?? "-"}
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
