"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Dashboard = {
  companies: {
    total: number;
    candidate: number;
    approaching: number;
    negotiating: number;
    client: number;
    unscored: number;
  };
  contents: { draft: number; in_review: number; published: number };
  keywords: { tracked: number };
  calls: { week: number; appointments_week: number };
  serp: { last_fetched_at: string | null };
};

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/dashboard")
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? "取得に失敗しました");
        setData(json);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="text-sm text-gray-600 space-y-2">
        <p className="text-red-600">ダッシュボードを取得できません: {error}</p>
        <p>
          初期設定が未完了の可能性があります。
          <Link href="/setup" className="text-blue-600 hover:underline ml-1">
            セットアップ診断
          </Link>
          を確認してください。
        </p>
      </div>
    );
  }
  if (!data) return <p className="text-sm text-gray-400">読み込み中...</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">ダッシュボード</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card label="ターゲット企業" value={data.companies.total} href="/companies" />
        <Card label="商談中" value={data.companies.negotiating} href="/companies" />
        <Card label="受注" value={data.companies.client} href="/companies" />
        <Card
          label="今週のアポ獲得"
          value={data.calls.appointments_week}
          href="/calls"
        />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Panel title="営業ファネル" href="/companies">
          <Row label="候補" value={data.companies.candidate} />
          <Row label="アプローチ中" value={data.companies.approaching} />
          <Row label="商談中" value={data.companies.negotiating} />
          <Row label="受注" value={data.companies.client} />
          <Row label="未採点(スコア)" value={data.companies.unscored} />
        </Panel>
        <Panel title="コンテンツ" href="/contents">
          <Row label="下書き" value={data.contents.draft} />
          <Row label="レビュー待ち" value={data.contents.in_review} />
          <Row label="公開済み" value={data.contents.published} />
        </Panel>
        <Panel title="SEO計測" href="/keywords">
          <Row label="計測中キーワード" value={data.keywords.tracked} />
          <Row label="今週の架電数" value={data.calls.week} />
          <div className="text-xs text-gray-400 pt-1">
            順位最終取得:{" "}
            {data.serp.last_fetched_at
              ? new Date(data.serp.last_fetched_at).toLocaleString("ja-JP")
              : "未取得"}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Card({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link
      href={href}
      className="bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-colors"
    >
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
    </Link>
  );
}

function Panel({
  title,
  href,
  children,
}: {
  title: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Link href={href} className="text-xs text-gray-400 hover:text-gray-700">
          開く
        </Link>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 font-medium">{value}</span>
    </div>
  );
}
