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
  const [maxSegments, setMaxSegments] = useState(500);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [monthUsd, setMonthUsd] = useState<number | null>(null);
  const [serpSearches, setSerpSearches] = useState<number | null>(null);
  const [serpUsd, setSerpUsd] = useState<number | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichMessage, setEnrichMessage] = useState("");
  const [keymanRunning, setKeymanRunning] = useState(false);
  const [keymanMessage, setKeymanMessage] = useState("");

  const loadUsage = useCallback(async () => {
    const data = await fetch("/api/usage").then((r) => r.json()).catch(() => null);
    if (data && typeof data.month_usd === "number") setMonthUsd(data.month_usd);
    if (data && typeof data.month_serp_searches === "number")
      setSerpSearches(data.month_serp_searches);
    if (data && typeof data.month_serp_usd === "number") setSerpUsd(data.month_serp_usd);
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
  const selectedComboKey =
    databaseId && businessModelId ? `${databaseId}:${businessModelId}` : "";

  const combos = (() => {
    const map = new Map<
      string,
      { dbId: string; bmId: string; label: string; count: number; done: number }
    >();
    for (const seg of segments) {
      const dbId = seg.industries?.database_id;
      const bmId = seg.business_model_id;
      if (!dbId || !bmId) continue;
      const key = `${dbId}:${bmId}`;
      const existing = map.get(key);
      if (existing) {
        existing.count++;
        if (seg.research_done) existing.done++;
      } else {
        const dbName = seg.industries?.industry_databases?.name ?? "?";
        const bmName = seg.business_models?.name ?? "?";
        map.set(key, {
          dbId,
          bmId,
          label: `${dbName} × ${bmName}`,
          count: 1,
          done: seg.research_done ? 1 : 0,
        });
      }
    }
    return [...map.values()]
      // 全セグメント取得完了の組み合わせは選択肢から外す(選択中のものは残す)
      .filter(
        (combo) =>
          combo.done < combo.count ||
          `${combo.dbId}:${combo.bmId}` === selectedComboKey
      )
      .sort((a, b) => a.label.localeCompare(b.label, "ja"));
  })();

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

  type ResearchJob = {
    id: string;
    status: "queued" | "running" | "done" | "error" | "canceled";
    total: number;
    processed: number;
    inserted: number;
    failed: number;
    cost_usd: number;
    error: string | null;
  };

  const applyJob = useCallback(
    (job: ResearchJob | null) => {
      if (!job) {
        setResearching(false);
        return;
      }
      setJobId(job.id);
      const active = job.status === "queued" || job.status === "running";
      setResearching(active);
      const pct = job.total ? Math.round((job.processed / job.total) * 100) : 0;
      const cost = `コスト $${(job.cost_usd ?? 0).toFixed(3)}`;
      const fail = job.failed > 0 ? ` / 失敗 ${job.failed}` : "";
      if (active) {
        const head = job.status === "queued" ? "待機中" : "リサーチ中";
        setProgress(
          `${head} ${job.processed}/${job.total}セグメント(${pct}%) / 登録 ${job.inserted}社 / ${cost}${fail}`
        );
      } else if (job.status === "done") {
        setProgress(
          `完了: ${job.processed}セグメント処理、${job.inserted}社を登録しました(${cost}${fail})`
        );
      } else if (job.status === "canceled") {
        setProgress(
          `キャンセルしました(${job.processed}/${job.total}セグメント処理済み、${job.inserted}社登録)`
        );
      } else if (job.status === "error") {
        setProgress("");
        setError(job.error ?? "リサーチジョブでエラーが発生しました");
      }
    },
    []
  );

  // ジョブ状態をポーリング(タブを閉じて再訪しても進捗を復元)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let prevActive = false;
    const poll = async () => {
      const job: ResearchJob | null = await fetch("/api/companies/research/job")
        .then((r) => r.json())
        .catch(() => null);
      if (stopped) return;
      applyJob(job);
      const active = !!job && (job.status === "queued" || job.status === "running");
      // 進行中→完了に変わった瞬間に一覧を更新
      if (prevActive && !active) {
        load();
        loadUsage();
        loadSegments();
      }
      prevActive = active;
      if (active) timer = setTimeout(poll, 4000);
    };
    poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function research() {
    if (!businessModelId || !databaseId) {
      setError("特化先DB × ビジネスモデルを選択してください");
      return;
    }
    setError("");
    setProgress("ジョブを作成中...");
    const res = await fetch("/api/companies/research/job", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        business_model_id: businessModelId,
        database_id: databaseId,
        max_segments: maxSegments,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setProgress("");
      setError(data.error ?? "ジョブの作成に失敗しました");
      return;
    }
    setResearching(true);
    applyJob(data);
    // 作成直後から進捗ポーリングを開始
    pollJobOnce();
  }

  async function pollJobOnce() {
    const job: ResearchJob | null = await fetch("/api/companies/research/job")
      .then((r) => r.json())
      .catch(() => null);
    applyJob(job);
    if (job && (job.status === "queued" || job.status === "running")) {
      setTimeout(pollJobOnce, 4000);
    } else {
      load();
      loadUsage();
      loadSegments();
    }
  }

  async function cancelResearch() {
    if (!jobId) return;
    await fetch("/api/companies/research/job", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: jobId }),
    });
    setProgress("キャンセルを要求しました(処理中のバッチ完了後に停止します)");
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
        const parts = [
          `対象${data.targets}社中、${data.updated}社を更新`,
          `うちgBizINFOに属性データ未収録: ${data.no_data ?? 0}件`,
          `該当なし: ${data.not_found}件`,
          `法人重複: ${data.duplicated ?? 0}件`,
          `失敗: ${data.failed}件`,
          `残り未処理: ${data.remaining}件`,
        ];
        let message = `取得完了: ${parts.join(" / ")}`;
        if (data.targets === 0) {
          message =
            "対象企業がありません(運営会社名が取得できている&法人番号が未取得の企業が対象です)";
        } else if (data.first_error) {
          message += ` / 最初のエラー: ${data.first_error}`;
        }
        setEnrichMessage(message);
        load();
      }
    } catch {
      setError("通信エラーが発生しました");
      setEnrichMessage("");
    }
    setEnriching(false);
  }

  async function keymanResearch() {
    // 表示中の絞り込み範囲のうち、社名があり未調査の企業を最大20社・並列3で処理
    const targets = companies
      .filter((c) => c.name && !c.keyman_research_done && !c.do_not_contact)
      .slice(0, 20);
    if (targets.length === 0) {
      setKeymanMessage(
        "対象企業がありません(社名取得済み・未調査の企業が対象です)"
      );
      return;
    }
    setKeymanRunning(true);
    setError("");
    const CONCURRENCY = 3;
    let completed = 0;
    let contactsTotal = 0;
    let relationsTotal = 0;
    let runCost = 0;
    let failures = 0;
    let cursor = 0;

    const update = () =>
      setKeymanMessage(
        `キーマン調査中 ${completed}/${targets.length}(並列${CONCURRENCY}) / 担当者 ${contactsTotal}名・パートナー ${relationsTotal}社 / 累計コスト $${runCost.toFixed(3)}${failures > 0 ? ` / 失敗 ${failures}件` : ""}`
      );
    update();

    const worker = async () => {
      while (true) {
        const i = cursor++;
        if (i >= targets.length) return;
        try {
          const res = await fetch(`/api/companies/${targets[i].id}/keyman`, {
            method: "POST",
          });
          const data = await res.json();
          if (res.ok) {
            contactsTotal += data.contacts_inserted ?? 0;
            relationsTotal += data.relations_inserted ?? 0;
            runCost += data.cost_usd ?? 0;
          } else {
            failures++;
            setError(data.error ?? "一部の企業で失敗しました");
          }
        } catch {
          failures++;
        }
        completed++;
        update();
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker)
    );

    setKeymanMessage(
      `キーマン調査完了: ${targets.length}社 / 担当者 ${contactsTotal}名・パートナー ${relationsTotal}社を登録(コスト $${runCost.toFixed(3)}${failures > 0 ? ` / 失敗 ${failures}件` : ""})`
    );
    setKeymanRunning(false);
    load();
    loadUsage();
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
              {serpSearches !== null && (
                <>
                  {" / SERP API: "}
                  {serpSearches.toLocaleString()}回 ${(serpUsd ?? 0).toFixed(2)}
                </>
              )}
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
                {combo.label}(残り{combo.count - combo.done}/{combo.count}セグメント)
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-gray-500">
            最大
            <input
              type="number"
              min={1}
              max={2000}
              value={maxSegments}
              onChange={(e) => setMaxSegments(Number(e.target.value))}
              disabled={researching}
              className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 disabled:opacity-40"
            />
            セグメント
          </label>
          <button
            onClick={research}
            disabled={researching || enriching}
            className="px-4 py-1.5 bg-gray-900 text-white rounded-lg disabled:opacity-40"
          >
            {researching ? "実行中..." : "バックグラウンドで収集開始"}
          </button>
          {researching && (
            <button
              onClick={cancelResearch}
              className="px-3 py-1.5 border border-red-300 text-red-600 rounded-lg"
            >
              停止
            </button>
          )}
          <button
            onClick={enrich}
            disabled={researching || enriching || keymanRunning}
            className="px-4 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40"
          >
            {enriching ? "取得中..." : "法人番号・従業員数・資本金を取得(無料)"}
          </button>
          <button
            onClick={keymanResearch}
            disabled={researching || enriching || keymanRunning}
            className="px-4 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40"
          >
            {keymanRunning ? "調査中..." : "キーマン・ベンダーを取得(20社ずつ)"}
          </button>
        </div>
        {progress && <p className="text-xs text-gray-500">{progress}</p>}
        {enrichMessage && <p className="text-xs text-gray-500">{enrichMessage}</p>}
        {keymanMessage && <p className="text-xs text-gray-500">{keymanMessage}</p>}
        <p className="text-xs text-gray-400">
          サーバー側のバックグラウンドで収集します。開始後はこのタブを閉じても処理は継続し、再訪すると進捗が表示されます(最大2000セグメント・約5社/セグメント)。Google検索の上位から該当サイトを選別し、フッターから運営会社名を抽出して登録します。法人番号・従業員数・資本金は右のボタンでgBizINFO(経産省・無料)から補完します(一度に30社ずつ)
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
                      {c.name || <span className="text-gray-400">(社名未取得)</span>}
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
