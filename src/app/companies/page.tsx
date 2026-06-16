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

  type JobKind = "research" | "enrich" | "keyman";
  type JobMode = JobKind | "all";
  type ResearchJob = {
    id: string;
    kind: JobMode;
    phase: string | null;
    status: "queued" | "running" | "done" | "error" | "canceled";
    total: number;
    processed: number;
    inserted: number;
    failed: number;
    cost_usd: number;
    error: string | null;
  };

  // kind別のラベル(単位・成果物の名称)
  const JOB_LABELS: Record<JobKind, { name: string; unit: string; result: string }> = {
    research: { name: "企業リサーチ", unit: "セグメント", result: "登録社数" },
    enrich: { name: "法人番号・属性取得", unit: "社", result: "更新社数" },
    keyman: { name: "キーマン・ベンダー取得", unit: "社", result: "登録件数" },
  };
  const PHASE_NO: Record<string, string> = {
    research: "①リサーチ",
    enrich: "②法人番号取得",
    keyman: "③キーマン取得",
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
      const isAll = job.kind === "all";
      const phaseKind = (isAll ? job.phase : job.kind) as JobKind;
      const lbl = JOB_LABELS[phaseKind] ?? JOB_LABELS.research;
      const head = isAll ? `一括 ${PHASE_NO[job.phase ?? "research"] ?? ""}` : lbl.name;
      const pct = job.total ? Math.round((job.processed / job.total) * 100) : 0;
      const cost = `コスト $${(job.cost_usd ?? 0).toFixed(3)}`;
      const fail = job.failed > 0 ? ` / 失敗 ${job.failed}` : "";
      if (active) {
        const prefix = job.status === "queued" ? "待機中 " : "";
        setProgress(
          `${prefix}${head} ${job.processed}/${job.total}${lbl.unit}(${pct}%) / ${lbl.result} ${job.inserted} / ${cost}${fail}`
        );
      } else if (job.status === "done") {
        setProgress(
          `完了: ${isAll ? "一括処理" : lbl.name} / 成果 ${job.inserted}(${cost}${fail})`
        );
      } else if (job.status === "canceled") {
        setProgress(`キャンセルしました(成果 ${job.inserted}${fail})`);
      } else if (job.status === "error") {
        setProgress("");
        setError(job.error ?? "ジョブでエラーが発生しました");
      }
    },
    // JOB_LABELS / PHASE_NO は固定オブジェクト
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // ジョブ状態をポーリング(タブを閉じて再訪しても進捗を復元)。
  // 一時的な取得失敗ではポーリングを止めず、進行中の間はずっと監視し続ける。
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let prevActive = false;
    const poll = async () => {
      let ok = true;
      let job: ResearchJob | null = null;
      try {
        const res = await fetch("/api/companies/research/job");
        job = await res.json();
      } catch {
        ok = false; // ネットワーク等の一時失敗
      }
      if (stopped) return;
      if (!ok) {
        // 失敗時は状態を変えずに再試行(進行中の監視を止めない)
        timer = setTimeout(poll, 5000);
        return;
      }
      applyJob(job);
      const active = !!job && (job.status === "queued" || job.status === "running");
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

  // 実行前にコストを見積もって確認ダイアログを出し、OKならジョブを作成する。
  // kind='all' は特化先DB×ビジネスモデル未選択でも実行可(全社対象)。
  async function startJob(kind: JobMode) {
    if (kind !== "all" && (!businessModelId || !databaseId)) {
      setError("特化先DB × ビジネスモデルを選択してください");
      return;
    }
    setError("");

    // 1. コスト事前通知(見積り)
    const params = new URLSearchParams({ kind, max_segments: String(maxSegments) });
    if (businessModelId) params.set("business_model_id", businessModelId);
    if (databaseId) params.set("database_id", databaseId);
    setProgress("対象件数・コストを見積り中...");
    const est = await fetch(`/api/companies/research/job/estimate?${params}`)
      .then((r) => r.json())
      .catch(() => null);
    setProgress("");
    if (!est || est.error) {
      setError(est?.error ?? "見積りに失敗しました");
      return;
    }
    const scope =
      businessModelId && databaseId ? "選択中の特化先DB×ビジネスモデル" : "未処理の全社";
    const costLine =
      est.estimated_cost_usd > 0
        ? `概算コスト 約¥${est.estimated_cost_jpy.toLocaleString()}($${est.estimated_cost_usd.toFixed(3)})`
        : "コスト 無料(gBizINFO)";

    let message: string;
    if (kind === "all") {
      if (est.units === 0) {
        setError("一括実行: 未処理の対象がありません");
        return;
      }
      const b = est.breakdown ?? {};
      message =
        `①リサーチ→②法人番号→③キーマンを順にバックグラウンド実行します(対象: ${scope})。\n\n` +
        `① 企業リサーチ: ${b.research ?? 0}セグメント\n` +
        `② 法人番号・属性: ${b.enrich ?? 0}社(無料)\n` +
        `③ キーマン・ベンダー: ${b.keyman ?? 0}社\n` +
        `${costLine}\n` +
        (est.note ? `\n※${est.note}\n` : "") +
        `\n開始しますか?`;
    } else {
      const lbl = JOB_LABELS[kind];
      if (est.units === 0) {
        setError(`${lbl.name}: 対象がありません`);
        return;
      }
      message =
        `${lbl.name}をバックグラウンドで実行します(対象: ${scope})。\n\n` +
        `対象: ${est.units}${lbl.unit}(保留 ${est.pending}${lbl.unit})\n${costLine}\n\n開始しますか?`;
    }
    if (!window.confirm(message)) return;

    // 2. ジョブ作成
    setProgress("ジョブを作成中...");
    const res = await fetch("/api/companies/research/job", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        business_model_id: businessModelId || undefined,
        database_id: databaseId || undefined,
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
    pollJobOnce();
  }

  async function pollJobOnce() {
    let ok = true;
    let job: ResearchJob | null = null;
    try {
      const res = await fetch("/api/companies/research/job");
      job = await res.json();
    } catch {
      ok = false;
    }
    if (!ok) {
      // 一時失敗では監視を止めず再試行
      setTimeout(pollJobOnce, 5000);
      return;
    }
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
            件
          </label>
          <button
            onClick={() => startJob("all")}
            disabled={researching}
            className="px-4 py-1.5 bg-gray-900 text-white rounded-lg disabled:opacity-40"
          >
            ①②③ まとめて実行(未選択なら全社)
          </button>
          <button
            onClick={() => startJob("research")}
            disabled={researching}
            className="px-4 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40"
          >
            ① 企業を検索して登録
          </button>
          <button
            onClick={() => startJob("enrich")}
            disabled={researching}
            className="px-4 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40"
          >
            ② 法人番号・従業員数・資本金を取得(無料)
          </button>
          <button
            onClick={() => startJob("keyman")}
            disabled={researching}
            className="px-4 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40"
          >
            ③ キーマン・ベンダーを取得
          </button>
          {researching && (
            <button
              onClick={cancelResearch}
              className="px-3 py-1.5 border border-red-300 text-red-600 rounded-lg"
            >
              停止
            </button>
          )}
        </div>
        {progress && <p className="text-xs text-gray-500">{progress}</p>}
        <p className="text-xs text-gray-400">
          「①②③ まとめて実行」は、特化先DB×ビジネスモデルを未選択なら未処理の全社に対し、①Web検索で運営会社を発掘→②gBizINFO(無料)で法人番号・従業員数・資本金を補完→③キーマン・ベンダーをAI調査、をサーバー側で順に実行します(特化先DB×ビジネスモデルを選べばその範囲に限定)。①②③の個別ボタンは選択した範囲のみ実行します。いずれも開始前に対象件数と概算コスト(円・ドル)を確認し、開始後はタブを閉じても継続、再訪で進捗が復元します(同時に1ジョブ・各フェーズ最大2000件/回)。
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
