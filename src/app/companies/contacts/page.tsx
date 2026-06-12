"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import CompaniesNav from "../companies-nav";
import { Company, Contact, CONTACT_ROLE_LABELS } from "@/types";

type ContactRow = Contact & { companies: Pick<Company, "id" | "name"> | null };

export default function ContactsPage() {
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [excludeDnc, setExcludeDnc] = useState(true);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (role) params.set("role", role);
    if (excludeDnc) params.set("exclude_dnc", "true");
    const data = await fetch(`/api/contacts?${params}`).then((r) => r.json());
    if (Array.isArray(data)) setContacts(data);
  }, [q, role, excludeDnc]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">企業管理</h1>
      <CompaniesNav />

      <div className="flex flex-wrap gap-3 items-center bg-white border border-gray-200 rounded-xl p-3 text-sm">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
        >
          <option value="">全区分</option>
          {Object.entries(CONTACT_ROLE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-gray-600">
          <input
            type="checkbox"
            checked={excludeDnc}
            onChange={(e) => setExcludeDnc(e.target.checked)}
          />
          連絡拒否を除外
        </label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="氏名で検索"
          className="border border-gray-200 rounded-lg px-3 py-1.5 flex-1 min-w-40"
        />
        <span className="text-xs text-gray-400">
          担当者の追加は各企業の詳細画面から(取得元URL必須)
        </span>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs">
            <tr>
              <th className="text-left px-4 py-2 font-medium">氏名</th>
              <th className="text-left px-4 py-2 font-medium">区分</th>
              <th className="text-left px-4 py-2 font-medium">役職</th>
              <th className="text-left px-4 py-2 font-medium">企業</th>
              <th className="text-left px-4 py-2 font-medium">連絡先</th>
              <th className="text-left px-4 py-2 font-medium">取得元</th>
            </tr>
          </thead>
          <tbody>
            {contacts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  担当者が未登録です
                </td>
              </tr>
            )}
            {contacts.map((c) => (
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
                <td className="px-4 py-2">
                  {c.companies ? (
                    <Link
                      href={`/companies/${c.companies.id}`}
                      className="text-gray-700 hover:underline underline-offset-2"
                    >
                      {c.companies.name}
                    </Link>
                  ) : (
                    "-"
                  )}
                </td>
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
    </div>
  );
}
