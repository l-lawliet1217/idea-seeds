"use client";

import { useEffect, useState } from "react";

type Health = {
  env: Record<string, boolean>;
  auth: string;
  database: string;
  pending_migrations?: string[];
};

const ENV_LABELS: { key: string; label: string; required: boolean }[] = [
  { key: "NEXT_PUBLIC_SUPABASE_URL", label: "Supabase URL", required: true },
  { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", label: "Supabase anonキー", required: true },
  { key: "SUPABASE_SERVICE_ROLE_KEY", label: "Supabase service_roleキー", required: true },
  { key: "ANTHROPIC_API_KEY", label: "Anthropic APIキー(スコアリング・生成)", required: true },
  { key: "GBIZINFO_API_TOKEN", label: "gBizINFOトークン(企業取り込み)", required: false },
  { key: "SERPAPI_KEY", label: "SERP APIキー(順位取得)", required: false },
  { key: "CRON_SECRET", label: "Cronシークレット(順位取得)", required: false },
  { key: "WORDPRESS_URL", label: "WordPress URL(公開機能)", required: false },
  { key: "WORDPRESS_USER", label: "WordPressユーザー(公開機能)", required: false },
  { key: "WORDPRESS_APP_PASSWORD", label: "WordPressアプリパスワード(公開機能)", required: false },
];

const AUTH_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  ok: { ok: true, text: "Supabase Authに接続できています" },
  unreachable: {
    ok: false,
    text: "Supabaseに到達できません。プロジェクトが停止(Paused)していないかSupabaseダッシュボードで確認し、停止中ならRestoreしてください。URLが古い場合は環境変数を更新して再デプロイしてください",
  },
  env_missing: {
    ok: false,
    text: "Supabase URLまたはanonキーが未設定です。Vercelの環境変数に設定して再デプロイしてください",
  },
};

const DB_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  ok: { ok: true, text: "データベースに接続でき、スキーマも適用済みです" },
  migration_required: {
    ok: false,
    text: "未適用のマイグレーションがあります。下記のSQLをSupabaseのSQL Editorで番号順に実行してください",
  },
  unreachable: { ok: false, text: "データベースに到達できません(プロジェクト停止の可能性)" },
  env_missing: { ok: false, text: "SUPABASE_SERVICE_ROLE_KEY が未設定です" },
  error: { ok: false, text: "接続できましたが想定外のエラーです。キーが正しいか確認してください" },
};

export default function SetupPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setFailed(true));
  }, []);

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <h1 className="text-xl font-semibold">セットアップ診断</h1>
      <p className="text-sm text-gray-500">
        本番環境の設定状態を確認します。NGの項目を解消すると利用を開始できます。
        環境変数を変更した場合はVercelでRedeployが必要です。
      </p>

      {failed && (
        <p className="text-sm text-red-600">診断APIに接続できませんでした。</p>
      )}
      {!health && !failed && <p className="text-sm text-gray-400">確認中...</p>}

      {health && (
        <>
          <Section title="接続チェック">
            <CheckRow
              ok={AUTH_MESSAGES[health.auth]?.ok ?? false}
              label="Supabase Auth"
              detail={AUTH_MESSAGES[health.auth]?.text ?? health.auth}
            />
            <CheckRow
              ok={DB_MESSAGES[health.database]?.ok ?? false}
              label="データベース(スキーマ)"
              detail={DB_MESSAGES[health.database]?.text ?? health.database}
            />
            {(health.pending_migrations?.length ?? 0) > 0 && (
              <ul className="ml-12 space-y-1 text-xs">
                {health.pending_migrations!.map((file) => (
                  <li key={file}>
                    <a
                      href={`https://github.com/l-lawliet1217/idea-seeds/blob/main/supabase/migrations/${file}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      supabase/migrations/{file}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="環境変数(必須)">
            {ENV_LABELS.filter((e) => e.required).map((e) => (
              <CheckRow
                key={e.key}
                ok={health.env[e.key]}
                label={e.label}
                detail={health.env[e.key] ? "設定済み" : `${e.key} が未設定です`}
              />
            ))}
          </Section>

          <Section title="環境変数(機能別・後からでも可)">
            {ENV_LABELS.filter((e) => !e.required).map((e) => (
              <CheckRow
                key={e.key}
                ok={health.env[e.key]}
                label={e.label}
                detail={health.env[e.key] ? "設定済み" : `${e.key} が未設定です`}
              />
            ))}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h2 className="text-sm font-semibold mb-3">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function CheckRow({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail: string;
}) {
  return (
    <div className="flex gap-3 text-sm items-start">
      <span
        className={`flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full mt-0.5 ${
          ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
        }`}
      >
        {ok ? "OK" : "NG"}
      </span>
      <div>
        <span className="text-gray-800">{label}</span>
        <p className="text-xs text-gray-500 mt-0.5">{detail}</p>
      </div>
    </div>
  );
}
