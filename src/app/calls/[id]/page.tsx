"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  CALL_RESULT_LABELS,
  CallList,
  CallListItem,
  CallResult,
  Contact,
} from "@/types";

type ListDetail = CallList & {
  items: CallListItem[];
  script: { id: string; title: string; body: string | null } | null;
};

export default function CallListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [list, setList] = useState<ListDetail | null>(null);
  const [showScript, setShowScript] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/call-lists/${id}`);
    if (res.ok) setList(await res.json());
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!list) return <p className="text-sm text-gray-400">読み込み中...</p>;

  const pending = list.items.filter((i) => i.status === "pending").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-semibold">{list.name}</h1>
        <span className="text-sm text-gray-400">
          残り {pending} / {list.items.length} 件
        </span>
        {list.script && (
          <button
            onClick={() => setShowScript(!showScript)}
            className="text-sm text-blue-600 hover:underline"
          >
            {showScript ? "スクリプトを閉じる" : "スクリプトを表示"}
          </button>
        )}
      </div>

      {showScript && list.script && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-sm whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
          {list.script.body}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-3">
        {list.items.map((item) => (
          <CallItemCard
            key={item.id}
            item={item}
            onLogged={load}
            onError={setError}
          />
        ))}
      </div>
    </div>
  );
}

function CallItemCard({
  item,
  onLogged,
  onError,
}: {
  item: CallListItem;
  onLogged: () => void;
  onError: (msg: string) => void;
}) {
  const [result, setResult] = useState<CallResult>("connected");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);

  const company = item.companies;
  if (!company) return null;
  const contacts: Contact[] = company.contacts ?? [];
  // 担当者個人の電話が無ければ会社の代表電話で架電できるようにする(拒否企業は代表電話も使わない)
  const repPhone = company.do_not_contact ? null : company.phone;
  const callable: { id: string | null; name: string; phone: string; isRep: boolean }[] = contacts
    .filter((c) => !c.do_not_contact)
    .map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone || repPhone || "",
      isRep: !c.phone && !!repPhone,
    }))
    .filter((c) => c.phone);
  // 架電可能な担当者がいない場合でも、代表電話があれば代表宛に架電できるようにする
  if (callable.length === 0 && repPhone) {
    callable.push({ id: null, name: "代表", phone: repPhone, isRep: true });
  }

  async function logCall(contactId: string | null) {
    setBusy(true);
    onError("");
    const res = await fetch("/api/calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        call_list_item_id: item.id,
        company_id: item.company_id,
        contact_id: contactId,
        result,
        memo,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      onError(data.error ?? "記録に失敗しました");
      return;
    }
    setMemo("");
    onLogged();
  }

  return (
    <div
      className={`bg-white border rounded-xl p-4 text-sm ${
        item.status === "called" ? "border-gray-100 opacity-50" : "border-gray-200"
      }`}
    >
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          href={`/companies/${item.company_id}`}
          className="font-medium hover:underline underline-offset-2"
        >
          {company.name}
        </Link>
        {company.budget_score !== null && (
          <span className="text-xs text-gray-400">スコア {company.budget_score}</span>
        )}
        {item.status === "called" && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
            架電済み
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {callable.map((c) => (
            <a
              key={c.id ?? `rep-${c.phone}`}
              // Zoom Phoneデスクトップアプリのclick-to-call
              href={`zoomphonecall://${c.phone}`}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs"
            >
              {c.name}に架電 ({c.phone}{c.isRep ? " / 代表電話" : ""})
            </a>
          ))}
          {callable.length === 0 && (
            <span className="text-xs text-gray-400">電話番号未登録</span>
          )}
        </div>
      </div>

      {item.status === "pending" && (
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <select
            value={result}
            onChange={(e) => setResult(e.target.value as CallResult)}
            className="border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-xs"
          >
            {Object.entries(CALL_RESULT_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="メモ"
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs flex-1 min-w-40"
          />
          <button
            onClick={() => logCall(callable[0]?.id ?? null)}
            disabled={busy}
            className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs disabled:opacity-40"
          >
            結果を記録
          </button>
        </div>
      )}
    </div>
  );
}
