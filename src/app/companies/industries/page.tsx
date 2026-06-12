"use client";

import { useCallback, useEffect, useState } from "react";
import CompaniesNav from "../companies-nav";
import { Industry, IndustryDatabase } from "@/types";

export default function IndustriesPage() {
  const [databases, setDatabases] = useState<IndustryDatabase[]>([]);
  const [selectedDb, setSelectedDb] = useState("");
  const [items, setItems] = useState<Industry[]>([]);
  const [newDbName, setNewDbName] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const loadDatabases = useCallback(async () => {
    const data = await fetch("/api/industry-databases").then((r) => r.json());
    if (Array.isArray(data)) setDatabases(data);
  }, []);

  const loadItems = useCallback(async () => {
    if (!selectedDb) {
      setItems([]);
      return;
    }
    const data = await fetch(`/api/industries?database_id=${selectedDb}`).then((r) =>
      r.json()
    );
    if (Array.isArray(data)) setItems(data);
  }, [selectedDb]);

  useEffect(() => {
    loadDatabases();
  }, [loadDatabases]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  async function addDatabase(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/industry-databases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newDbName }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "登録に失敗しました");
      return;
    }
    setNewDbName("");
    setSelectedDb(data.id);
    loadDatabases();
  }

  async function bulkAdd() {
    if (!selectedDb || !bulkText.trim()) return;
    setBusy(true);
    setError("");
    setMessage("");
    const res = await fetch("/api/industries/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ database_id: selectedDb, text: bulkText }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "一括登録に失敗しました");
      return;
    }
    setMessage(`${data.inserted}件を登録しました(重複スキップ: ${data.skipped}件)`);
    setBulkText("");
    loadItems();
    loadDatabases();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">企業管理</h1>
      <CompaniesNav />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-green-700">{message}</p>}

      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold">特化先データベース</h2>
        <div className="flex flex-wrap gap-2">
          {databases.map((db) => (
            <button
              key={db.id}
              onClick={() => setSelectedDb(db.id)}
              className={`px-3 py-1.5 rounded-full border text-sm ${
                selectedDb === db.id
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              {db.name}
              <span className="ml-1.5 text-xs opacity-60">
                {db.industries?.[0]?.count ?? 0}
              </span>
            </button>
          ))}
        </div>
        <form onSubmit={addDatabase} className="flex gap-2 text-sm">
          <input
            required
            value={newDbName}
            onChange={(e) => setNewDbName(e.target.value)}
            placeholder="新しいデータベース名(例: 日本標準職業分類)"
            className="border border-gray-200 rounded-lg px-3 py-1.5 w-80"
          />
          <button className="px-3 py-1.5 border border-gray-300 rounded-lg">
            データベース追加
          </button>
        </form>
      </div>

      {selectedDb && (
        <>
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
            <h2 className="text-sm font-semibold">
              項目の一括登録(1行1項目。「名前,業種コード」形式でコードも登録可)
            </h2>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={6}
              placeholder={"例:\n美容室\n歯科医院\n動物病院,84\n..."}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
            />
            <button
              onClick={bulkAdd}
              disabled={busy || !bulkText.trim()}
              className="px-4 py-1.5 bg-gray-900 text-white rounded-lg text-sm disabled:opacity-40"
            >
              {busy ? "登録中..." : "一括登録"}
            </button>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 text-xs text-gray-500 border-b border-gray-100">
              {databases.find((d) => d.id === selectedDb)?.name} の項目(
              {items.length}件)
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">特化先</th>
                  <th className="text-left px-4 py-2 font-medium">業種コード</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-6 text-center text-gray-400">
                      項目が未登録です。上のフォームから一括登録してください
                    </td>
                  </tr>
                )}
                {items.map((ind) => (
                  <tr key={ind.id} className="border-t border-gray-100">
                    <td className="px-4 py-2">{ind.name}</td>
                    <td className="px-4 py-2 text-gray-500">
                      {ind.gbizinfo_code ?? ind.jsic_code ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {!selectedDb && (
        <p className="text-sm text-gray-400">
          データベースを選択すると項目の登録・一覧ができます
        </p>
      )}
    </div>
  );
}
