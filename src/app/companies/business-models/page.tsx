"use client";

import { useCallback, useEffect, useState } from "react";
import CompaniesNav from "../companies-nav";
import { BusinessModel } from "@/types";

export default function BusinessModelsPage() {
  const [models, setModels] = useState<BusinessModel[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const data = await fetch("/api/business-models").then((r) => r.json());
    if (Array.isArray(data)) setModels(data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/business-models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "登録に失敗しました");
      return;
    }
    setName("");
    setDescription("");
    load();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">企業管理</h1>
      <CompaniesNav />
      {error && <p className="text-sm text-red-600">{error}</p>}

      <form
        onSubmit={add}
        className="bg-white border border-gray-200 rounded-xl p-3 flex gap-2 text-sm"
      >
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ビジネスモデル名(例: 特化型採用ポータル)"
          className="border border-gray-200 rounded-lg px-3 py-1.5 w-72"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="説明(任意)"
          className="border border-gray-200 rounded-lg px-3 py-1.5 flex-1"
        />
        <button className="px-4 py-1.5 bg-gray-900 text-white rounded-lg">追加</button>
      </form>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs">
            <tr>
              <th className="text-left px-4 py-2 font-medium">名前</th>
              <th className="text-left px-4 py-2 font-medium">説明</th>
            </tr>
          </thead>
          <tbody>
            {models.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-6 text-center text-gray-400">
                  未登録です
                </td>
              </tr>
            )}
            {models.map((m) => (
              <tr key={m.id} className="border-t border-gray-100">
                <td className="px-4 py-2 font-medium">{m.name}</td>
                <td className="px-4 py-2 text-gray-500">{m.description ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
