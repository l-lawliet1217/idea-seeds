"use client";

import { useCallback, useEffect, useState } from "react";
import CompaniesNav from "../companies-nav";
import { Industry, IndustryDatabase } from "@/types";

export default function IndustriesPage() {
  const [databases, setDatabases] = useState<IndustryDatabase[]>([]);
  const [selectedDb, setSelectedDb] = useState("");
  const [items, setItems] = useState<Industry[]>([]);
  const [newDbName, setNewDbName] = useState("");
  const [editingDb, setEditingDb] = useState("");
  const [editingName, setEditingName] = useState("");
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

  function startEditDatabase(db: IndustryDatabase) {
    setEditingDb(db.id);
    setEditingName(db.name);
    setError("");
    setMessage("");
  }

  async function commitEditDatabase() {
    const id = editingDb;
    const name = editingName.trim();
    const current = databases.find((d) => d.id === id);
    if (!id || !current) return;
    if (!name || name === current.name) {
      setEditingDb("");
      return;
    }
    const res = await fetch(`/api/industry-databases/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "名前の変更に失敗しました");
      return;
    }
    setEditingDb("");
    loadDatabases();
  }

  async function deleteDatabase(db: IndustryDatabase) {
    const count = db.industries?.[0]?.count ?? 0;
    if (
      !window.confirm(
        `特化先データベース「${db.name}」を削除しますか?\n紐づく特化先項目${count}件も削除されます。この操作は取り消せません。`
      )
    )
      return;
    setError("");
    setMessage("");
    const res = await fetch(`/api/industry-databases/${db.id}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "削除に失敗しました");
      return;
    }
    setMessage(`「${db.name}」を削除しました(項目${data.removed_items}件)`);
    if (selectedDb === db.id) setSelectedDb("");
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
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="text-left px-4 py-2 font-medium">特化先DB名</th>
                <th className="text-right px-4 py-2 font-medium w-24">項目数</th>
                <th className="text-right px-4 py-2 font-medium w-28">操作</th>
              </tr>
            </thead>
            <tbody>
              {databases.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-gray-400">
                    データベースが未登録です。下のフォームから追加してください
                  </td>
                </tr>
              )}
              {databases.map((db) => (
                <tr
                  key={db.id}
                  onClick={() => editingDb !== db.id && setSelectedDb(db.id)}
                  className={`border-t border-gray-100 cursor-pointer ${
                    selectedDb === db.id ? "bg-gray-900/5" : "hover:bg-gray-50"
                  }`}
                >
                  <td className="px-4 py-2">
                    {editingDb === db.id ? (
                      <input
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={commitEditDatabase}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEditDatabase();
                          if (e.key === "Escape") setEditingDb("");
                        }}
                        className="w-64 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900"
                      />
                    ) : (
                      <span
                        onDoubleClick={() => startEditDatabase(db)}
                        title="ダブルクリックで名前を編集"
                        className={`font-medium ${
                          selectedDb === db.id ? "text-gray-900" : "text-gray-700"
                        }`}
                      >
                        {db.name}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-500">
                    {db.industries?.[0]?.count ?? 0}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {editingDb !== db.id && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditDatabase(db);
                          }}
                          title="名前を編集"
                          className="text-xs text-gray-400 hover:text-gray-700 px-1.5"
                        >
                          編集
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteDatabase(db);
                          }}
                          title="このデータベースを削除"
                          className="text-xs text-red-500 hover:text-red-700 px-1.5"
                        >
                          削除
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
