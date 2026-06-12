"use client";

import { useCallback, useEffect, useState } from "react";
import CompaniesNav from "../companies-nav";
import { Industry } from "@/types";

export default function IndustriesPage() {
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const data = await fetch("/api/industries").then((r) => r.json());
    if (Array.isArray(data)) setIndustries(data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/industries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, gbizinfo_code: code }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "登録に失敗しました");
      return;
    }
    setName("");
    setCode("");
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
          placeholder="特化先(業界)名(例: 介護)"
          className="border border-gray-200 rounded-lg px-3 py-1.5 w-72"
        />
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="業種コード(gBizINFO検索用・任意)"
          className="border border-gray-200 rounded-lg px-3 py-1.5 w-64"
        />
        <button className="px-4 py-1.5 bg-gray-900 text-white rounded-lg">追加</button>
      </form>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs">
            <tr>
              <th className="text-left px-4 py-2 font-medium">特化先</th>
              <th className="text-left px-4 py-2 font-medium">業種コード</th>
              <th className="text-left px-4 py-2 font-medium">メモ</th>
            </tr>
          </thead>
          <tbody>
            {industries.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-400">
                  未登録です
                </td>
              </tr>
            )}
            {industries.map((ind) => (
              <tr key={ind.id} className="border-t border-gray-100">
                <td className="px-4 py-2 font-medium">{ind.name}</td>
                <td className="px-4 py-2 text-gray-500">
                  {ind.gbizinfo_code ?? ind.jsic_code ?? "-"}
                </td>
                <td className="px-4 py-2 text-gray-400 text-xs">
                  {ind.source_note ?? "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
