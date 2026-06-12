"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import CompaniesNav from "../companies-nav";
import { Company, CompanyRelation, RELATION_TYPE_LABELS } from "@/types";

type RelationRow = CompanyRelation & {
  companies: Pick<Company, "id" | "name"> | null;
};

export default function PartnersPage() {
  const [relations, setRelations] = useState<RelationRow[]>([]);
  const [type, setType] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (q) params.set("q", q);
    const data = await fetch(`/api/relations?${params}`).then((r) => r.json());
    if (Array.isArray(data)) setRelations(data);
  }, [type, q]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">企業管理</h1>
      <CompaniesNav />

      <div className="flex flex-wrap gap-3 items-center bg-white border border-gray-200 rounded-xl p-3 text-sm">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
        >
          <option value="">全種別</option>
          {Object.entries(RELATION_TYPE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="パートナー名で検索"
          className="border border-gray-200 rounded-lg px-3 py-1.5 flex-1 min-w-40"
        />
        <span className="text-xs text-gray-400">
          パートナーの追加は各企業の詳細画面(関連会社タブ)から
        </span>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs">
            <tr>
              <th className="text-left px-4 py-2 font-medium">パートナー</th>
              <th className="text-left px-4 py-2 font-medium">種別</th>
              <th className="text-left px-4 py-2 font-medium">電話番号</th>
              <th className="text-left px-4 py-2 font-medium">支援先企業</th>
              <th className="text-left px-4 py-2 font-medium">取得元</th>
            </tr>
          </thead>
          <tbody>
            {relations.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                  パートナーが未登録です
                </td>
              </tr>
            )}
            {relations.map((r) => (
              <tr key={r.id} className="border-t border-gray-100">
                <td className="px-4 py-2 font-medium">{r.related_name}</td>
                <td className="px-4 py-2 text-gray-500">
                  {RELATION_TYPE_LABELS[r.relation_type]}
                </td>
                <td className="px-4 py-2 text-gray-500">{r.phone ?? "-"}</td>
                <td className="px-4 py-2">
                  {r.companies ? (
                    <Link
                      href={`/companies/${r.companies.id}`}
                      className="text-gray-700 hover:underline underline-offset-2"
                    >
                      {r.companies.name}
                    </Link>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="px-4 py-2">
                  {r.source_url ? (
                    <a
                      href={r.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline text-xs"
                    >
                      ソース
                    </a>
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
