"use client";

import { useCallback, useEffect, useState } from "react";
import type { BusinessModel, Industry, Segment } from "@/types";

export default function SegmentsPage() {
  const [businessModels, setBusinessModels] = useState<BusinessModel[]>([]);
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [bm, ind, seg] = await Promise.all([
      fetch("/api/business-models").then((r) => r.json()),
      fetch("/api/industries").then((r) => r.json()),
      fetch("/api/segments").then((r) => r.json()),
    ]);
    if (Array.isArray(bm)) setBusinessModels(bm);
    if (Array.isArray(ind)) setIndustries(ind);
    if (Array.isArray(seg)) setSegments(seg);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function post(url: string, body: Record<string, string>) {
    setError("");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "登録に失敗しました");
      return false;
    }
    await load();
    return true;
  }

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">セグメント管理</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid md:grid-cols-2 gap-6">
        <MasterCard
          title="ビジネスモデル"
          items={businessModels.map((b) => b.name)}
          placeholder="例: SaaS、受託開発、D2C"
          onAdd={(name) => post("/api/business-models", { name })}
        />
        <IndustryCard
          industries={industries}
          onAdd={(name, code) =>
            post("/api/industries", { name, gbizinfo_code: code })
          }
        />
      </div>

      <SegmentSection
        businessModels={businessModels}
        industries={industries}
        segments={segments}
        onAdd={(business_model_id, industry_id) =>
          post("/api/segments", { business_model_id, industry_id })
        }
      />
    </div>
  );
}

function MasterCard({
  title,
  items,
  placeholder,
  onAdd,
}: {
  title: string;
  items: string[];
  placeholder: string;
  onAdd: (name: string) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h2 className="text-sm font-semibold mb-3">{title}</h2>
      <ul className="space-y-1 mb-3 text-sm text-gray-700">
        {items.length === 0 && <li className="text-gray-400">未登録</li>}
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          if (await onAdd(name.trim())) setName("");
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={placeholder}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
        />
        <button className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm">
          追加
        </button>
      </form>
    </div>
  );
}

function IndustryCard({
  industries,
  onAdd,
}: {
  industries: Industry[];
  onAdd: (name: string, code: string) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h2 className="text-sm font-semibold mb-3">業界</h2>
      <ul className="space-y-1 mb-3 text-sm text-gray-700">
        {industries.length === 0 && <li className="text-gray-400">未登録</li>}
        {industries.map((ind) => (
          <li key={ind.id}>
            {ind.name}
            {ind.gbizinfo_code && (
              <span className="text-xs text-gray-400 ml-2">
                コード: {ind.gbizinfo_code}
              </span>
            )}
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          if (await onAdd(name.trim(), code.trim())) {
            setName("");
            setCode("");
          }
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="業界名(例: 製造業)"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
        />
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="業種コード"
          className="w-28 border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
        />
        <button className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm">
          追加
        </button>
      </form>
    </div>
  );
}

function SegmentSection({
  businessModels,
  industries,
  segments,
  onAdd,
}: {
  businessModels: BusinessModel[];
  industries: Industry[];
  segments: Segment[];
  onAdd: (businessModelId: string, industryId: string) => Promise<boolean>;
}) {
  const [bmId, setBmId] = useState("");
  const [indId, setIndId] = useState("");
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h2 className="text-sm font-semibold mb-3">
        セグメント(ビジネスモデル×業界)
      </h2>
      <ul className="space-y-1 mb-4 text-sm text-gray-700">
        {segments.length === 0 && <li className="text-gray-400">未登録</li>}
        {segments.map((seg) => (
          <li key={seg.id}>{seg.name}</li>
        ))}
      </ul>
      <form
        className="flex gap-2 items-center"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!bmId || !indId) return;
          if (await onAdd(bmId, indId)) {
            setBmId("");
            setIndId("");
          }
        }}
      >
        <select
          value={bmId}
          onChange={(e) => setBmId(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
        >
          <option value="">ビジネスモデルを選択</option>
          {businessModels.map((bm) => (
            <option key={bm.id} value={bm.id}>
              {bm.name}
            </option>
          ))}
        </select>
        <span className="text-gray-400 text-sm">×</span>
        <select
          value={indId}
          onChange={(e) => setIndId(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
        >
          <option value="">業界を選択</option>
          {industries.map((ind) => (
            <option key={ind.id} value={ind.id}>
              {ind.name}
            </option>
          ))}
        </select>
        <button className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm">
          セグメント作成
        </button>
      </form>
    </div>
  );
}
