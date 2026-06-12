"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  CompanyDetail,
  CompanyStatus,
  COMPANY_STATUS_LABELS,
  CONTACT_ROLE_LABELS,
  ContactRole,
  RELATION_TYPE_LABELS,
  RelationType,
} from "@/types";

type Tab = "overview" | "contacts" | "relations" | "timeline";

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/companies/${id}`);
    if (res.ok) setCompany(await res.json());
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!company) {
    return <p className="text-gray-400 text-sm">読み込み中...</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">
            {company.name || company.service_name || "(社名未取得)"}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {company.segments?.name ?? "セグメント未設定"}
            {company.corporate_number && ` / 法人番号: ${company.corporate_number}`}
          </p>
        </div>
        <button
          onClick={async () => {
            if (!confirm("この企業を削除しますか?")) return;
            const res = await fetch(`/api/companies/${company.id}`, {
              method: "DELETE",
            });
            if (res.ok) {
              location.href = "/companies";
            } else {
              const data = await res.json().catch(() => ({}));
              setError(data.error ?? "削除に失敗しました");
            }
          }}
          className="text-xs text-red-500 hover:text-red-700"
        >
          削除
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex border-b border-gray-200 text-sm">
        {(
          [
            { key: "overview", label: "概要" },
            { key: "contacts", label: `担当者 (${company.contacts.length})` },
            { key: "relations", label: `関連会社 (${company.company_relations.length})` },
            { key: "timeline", label: "タイムライン" },
          ] as { key: Tab; label: string }[]
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 border-b-2 -mb-px transition-colors ${
              tab === key
                ? "border-gray-900 text-gray-900 font-medium"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <OverviewTab company={company} onChanged={load} onError={setError} />
      )}
      {tab === "contacts" && (
        <ContactsTab company={company} onChanged={load} onError={setError} />
      )}
      {tab === "relations" && (
        <RelationsTab company={company} onChanged={load} onError={setError} />
      )}
      {tab === "timeline" && <TimelineTab company={company} />}
    </div>
  );
}

function OverviewTab({
  company,
  onChanged,
  onError,
}: {
  company: CompanyDetail;
  onChanged: () => void;
  onError: (msg: string) => void;
}) {
  const [scoring, setScoring] = useState(false);

  async function patch(body: Record<string, unknown>) {
    onError("");
    const res = await fetch(`/api/companies/${company.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      onError(data.error ?? "更新に失敗しました");
      return;
    }
    onChanged();
  }

  async function rescore() {
    setScoring(true);
    onError("");
    const res = await fetch(`/api/companies/${company.id}/score`, {
      method: "POST",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      onError(data.error ?? "スコアリングに失敗しました");
    }
    setScoring(false);
    onChanged();
  }

  return (
    <div className="grid md:grid-cols-2 gap-5">
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 text-sm">
        <Row label="サービス" value={company.service_name ?? "-"} />
        <Row
          label="サイトURL"
          value={
            company.service_url ? (
              <a
                href={company.service_url}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline"
              >
                {company.service_url}
              </a>
            ) : (
              "-"
            )
          }
        />
        <Row
          label="資本金"
          value={
            company.capital_jpy !== null
              ? `${company.capital_jpy.toLocaleString()}円`
              : "-"
          }
        />
        <Row label="代表電話" value={company.phone ?? "-"} />
        <Row label="所在地" value={company.prefecture ?? "-"} />
        <Row
          label="売上高"
          value={
            company.revenue_jpy !== null
              ? `${company.revenue_jpy.toLocaleString()}円`
              : "-"
          }
        />
        <Row label="従業員数" value={company.employees?.toString() ?? "-"} />
        <Row
          label="Webサイト"
          value={
            company.website_url ? (
              <a
                href={company.website_url}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline"
              >
                {company.website_url}
              </a>
            ) : (
              "-"
            )
          }
        />
        <Row
          label="取得元"
          value={
            company.source_url ? (
              <a
                href={company.source_url}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline"
              >
                {company.source ?? "リンク"}
              </a>
            ) : (
              company.source ?? "-"
            )
          }
        />
        <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
          <span className="text-gray-400 text-xs w-20">ステータス</span>
          <select
            value={company.status}
            onChange={(e) => patch({ status: e.target.value as CompanyStatus })}
            className="border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
          >
            {Object.entries(COMPANY_STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-gray-600 text-xs">
            <input
              type="checkbox"
              checked={company.do_not_contact}
              onChange={(e) => patch({ do_not_contact: e.target.checked })}
            />
            連絡拒否
          </label>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 text-sm">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">支払余力スコア(月額60万円)</h3>
          <button
            onClick={rescore}
            disabled={scoring}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs disabled:opacity-40"
          >
            {scoring ? "採点中..." : "スコア算出"}
          </button>
        </div>
        {company.budget_score !== null ? (
          <>
            <p className="text-3xl font-semibold">{company.budget_score}</p>
            <p className="text-gray-500 mt-2 leading-relaxed">
              {company.budget_score_reason}
            </p>
          </>
        ) : (
          <p className="text-gray-400">未採点です。「スコア算出」を実行してください。</p>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="text-gray-400 text-xs w-20 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-gray-800">{value}</span>
    </div>
  );
}

function ContactsTab({
  company,
  onChanged,
  onError,
}: {
  company: CompanyDetail;
  onChanged: () => void;
  onError: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    name: "",
    role: "other" as ContactRole,
    title: "",
    email: "",
    phone: "",
    source_url: "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    onError("");
    const res = await fetch(`/api/companies/${company.id}/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      onError(data.error ?? "登録に失敗しました");
      return;
    }
    setForm({ name: "", role: "other", title: "", email: "", phone: "", source_url: "" });
    onChanged();
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs">
            <tr>
              <th className="text-left px-4 py-2 font-medium">氏名</th>
              <th className="text-left px-4 py-2 font-medium">区分</th>
              <th className="text-left px-4 py-2 font-medium">役職</th>
              <th className="text-left px-4 py-2 font-medium">連絡先</th>
              <th className="text-left px-4 py-2 font-medium">取得元</th>
            </tr>
          </thead>
          <tbody>
            {company.contacts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                  担当者が未登録です
                </td>
              </tr>
            )}
            {company.contacts.map((c) => (
              <tr key={c.id} className="border-t border-gray-100">
                <td className="px-4 py-2">
                  {c.name}
                  {c.do_not_contact && (
                    <span className="ml-2 text-xs text-red-500">連絡拒否</span>
                  )}
                </td>
                <td className="px-4 py-2 text-gray-500">
                  {CONTACT_ROLE_LABELS[c.role]}
                </td>
                <td className="px-4 py-2 text-gray-500">{c.title ?? "-"}</td>
                <td className="px-4 py-2 text-gray-500">
                  {[c.email, c.phone].filter(Boolean).join(" / ") || "-"}
                </td>
                <td className="px-4 py-2">
                  <a
                    href={c.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:underline text-xs"
                  >
                    ソース
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form
        onSubmit={submit}
        className="bg-white border border-gray-200 rounded-xl p-4 grid grid-cols-3 gap-3 text-sm"
      >
        <input
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="氏名(必須)"
          className="border border-gray-200 rounded-lg px-3 py-2"
        />
        <select
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value as ContactRole })}
          className="border border-gray-200 rounded-lg px-3 py-2 bg-white"
        >
          {Object.entries(CONTACT_ROLE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="役職"
          className="border border-gray-200 rounded-lg px-3 py-2"
        />
        <input
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="メール"
          className="border border-gray-200 rounded-lg px-3 py-2"
        />
        <input
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder="電話番号"
          className="border border-gray-200 rounded-lg px-3 py-2"
        />
        <input
          required
          type="url"
          value={form.source_url}
          onChange={(e) => setForm({ ...form, source_url: e.target.value })}
          placeholder="取得元URL(必須)"
          className="border border-gray-200 rounded-lg px-3 py-2"
        />
        <button className="col-span-3 justify-self-end px-4 py-2 bg-gray-900 text-white rounded-lg">
          担当者を追加
        </button>
      </form>
    </div>
  );
}

function RelationsTab({
  company,
  onChanged,
  onError,
}: {
  company: CompanyDetail;
  onChanged: () => void;
  onError: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    related_name: "",
    relation_type: "vendor" as RelationType,
    phone: "",
    source_url: "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    onError("");
    const res = await fetch(`/api/companies/${company.id}/relations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      onError(data.error ?? "登録に失敗しました");
      return;
    }
    setForm({ related_name: "", relation_type: "vendor", phone: "", source_url: "" });
    onChanged();
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs">
            <tr>
              <th className="text-left px-4 py-2 font-medium">会社名</th>
              <th className="text-left px-4 py-2 font-medium">種別</th>
              <th className="text-left px-4 py-2 font-medium">電話番号</th>
            </tr>
          </thead>
          <tbody>
            {company.company_relations.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-400">
                  ベンダー・投資家が未登録です
                </td>
              </tr>
            )}
            {company.company_relations.map((r) => (
              <tr key={r.id} className="border-t border-gray-100">
                <td className="px-4 py-2">{r.related_name}</td>
                <td className="px-4 py-2 text-gray-500">
                  {RELATION_TYPE_LABELS[r.relation_type]}
                </td>
                <td className="px-4 py-2 text-gray-500">{r.phone ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form
        onSubmit={submit}
        className="bg-white border border-gray-200 rounded-xl p-4 flex gap-3 text-sm flex-wrap"
      >
        <input
          required
          value={form.related_name}
          onChange={(e) => setForm({ ...form, related_name: e.target.value })}
          placeholder="会社名(必須)"
          className="border border-gray-200 rounded-lg px-3 py-2 flex-1 min-w-40"
        />
        <select
          value={form.relation_type}
          onChange={(e) =>
            setForm({ ...form, relation_type: e.target.value as RelationType })
          }
          className="border border-gray-200 rounded-lg px-3 py-2 bg-white"
        >
          {Object.entries(RELATION_TYPE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <input
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder="電話番号"
          className="border border-gray-200 rounded-lg px-3 py-2 w-36"
        />
        <input
          type="url"
          value={form.source_url}
          onChange={(e) => setForm({ ...form, source_url: e.target.value })}
          placeholder="取得元URL"
          className="border border-gray-200 rounded-lg px-3 py-2 flex-1 min-w-40"
        />
        <button className="px-4 py-2 bg-gray-900 text-white rounded-lg">追加</button>
      </form>
    </div>
  );
}

function TimelineTab({ company }: { company: CompanyDetail }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      {company.activities.length === 0 ? (
        <p className="text-sm text-gray-400">まだ接点履歴がありません</p>
      ) : (
        <ul className="space-y-3">
          {company.activities.map((a) => (
            <li key={a.id} className="flex gap-3 text-sm">
              <span className="text-xs text-gray-400 w-36 flex-shrink-0 pt-0.5">
                {new Date(a.occurred_at).toLocaleString("ja-JP")}
              </span>
              <span className="text-gray-700">{a.summary ?? a.activity_type}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
