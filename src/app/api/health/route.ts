import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// マイグレーションごとの代表テーブル(存在チェックで適用状況を判定)
const MIGRATION_MARKERS: { file: string; table: string }[] = [
  { file: "00001_init.sql", table: "companies" },
  { file: "00003_givers.sql", table: "givers_friends" },
  { file: "00004_givers_ext.sql", table: "givers_introductions" },
  { file: "00005_industry_databases.sql", table: "industry_databases" },
  { file: "00007_api_usage.sql", table: "api_usage_logs" },
];

// 列追加マイグレーションの確認(代表列をselectして判定)
const COLUMN_MARKERS: { file: string; table: string; column: string }[] = [
  { file: "00006_company_research.sql", table: "companies", column: "service_url" },
  { file: "00008_segment_research_flag.sql", table: "segments", column: "research_done" },
  { file: "00009_keyman.sql", table: "companies", column: "keyman_research_done" },
];

// セットアップ診断。秘密情報は返さず、設定の有無と接続状態のみ返す
export async function GET() {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
    GBIZINFO_API_TOKEN: !!process.env.GBIZINFO_API_TOKEN,
    SERPAPI_KEY: !!process.env.SERPAPI_KEY,
    DATAFORSEO_LOGIN: !!process.env.DATAFORSEO_LOGIN,
    DATAFORSEO_PASSWORD: !!process.env.DATAFORSEO_PASSWORD,
    CRON_SECRET: !!process.env.CRON_SECRET,
    WORDPRESS_URL: !!process.env.WORDPRESS_URL,
    WORDPRESS_USER: !!process.env.WORDPRESS_USER,
    WORDPRESS_APP_PASSWORD: !!process.env.WORDPRESS_APP_PASSWORD,
  };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Supabase Authへの到達性(プロジェクト停止の検出)
  let auth = "env_missing";
  if (url && anonKey) {
    try {
      const res = await fetch(`${url}/auth/v1/health`, {
        headers: { apikey: anonKey },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
      auth = res.ok ? "ok" : `error_${res.status}`;
    } catch {
      auth = "unreachable";
    }
  }

  // マイグレーション適用状況(代表テーブルの存在で判定)
  let database = "env_missing";
  const pendingMigrations: string[] = [];
  if (url && serviceKey) {
    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false },
    });
    try {
      const [tableResults, columnResults] = await Promise.all([
        Promise.all(
          MIGRATION_MARKERS.map((m) =>
            supabase.from(m.table).select("*", { head: true, count: "exact" })
          )
        ),
        Promise.all(
          COLUMN_MARKERS.map((m) =>
            supabase.from(m.table).select(m.column, { head: true, count: "exact" })
          )
        ),
      ]);
      let reachable = true;
      tableResults.forEach((res, i) => {
        if (!res.error) return;
        if (res.error.code === "42P01" || /schema cache|does not exist/.test(res.error.message)) {
          pendingMigrations.push(MIGRATION_MARKERS[i].file);
        } else {
          reachable = false;
        }
      });
      columnResults.forEach((res, i) => {
        if (!res.error) return;
        if (/column|does not exist|schema cache/.test(res.error.message)) {
          pendingMigrations.push(COLUMN_MARKERS[i].file);
        }
      });
      if (!reachable) database = "error";
      else if (pendingMigrations.length > 0) database = "migration_required";
      else database = "ok";
    } catch {
      database = "unreachable";
    }
  }

  return NextResponse.json({ env, auth, database, pending_migrations: pendingMigrations });
}
