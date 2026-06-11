import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// セットアップ診断。秘密情報は返さず、設定の有無と接続状態のみ返す
export async function GET() {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
    GBIZINFO_API_TOKEN: !!process.env.GBIZINFO_API_TOKEN,
    SERPAPI_KEY: !!process.env.SERPAPI_KEY,
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

  // DBスキーマの確認(マイグレーション未実行の検出)
  let database = "env_missing";
  if (url && serviceKey) {
    try {
      const supabase = createClient(url, serviceKey, {
        auth: { persistSession: false },
      });
      const { error } = await supabase
        .from("companies")
        .select("id", { head: true, count: "exact" });
      if (!error) {
        database = "ok";
      } else if (error.code === "42P01" || /does not exist/.test(error.message)) {
        database = "migration_required";
      } else {
        database = "error";
      }
    } catch {
      database = "unreachable";
    }
  }

  return NextResponse.json({ env, auth, database });
}
