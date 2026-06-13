import { NextResponse } from "next/server";
import { serpProvider } from "@/lib/serp";

// SERPプロバイダの認証情報が実際に通るかをテストする診断用エンドポイント。
// 秘密情報(キー/パスワード)は返さず、認証結果と残高のみ返す。
export async function GET() {
  const provider = serpProvider();

  if (provider === "dataforseo") {
    const login = process.env.DATAFORSEO_LOGIN?.trim();
    const password = process.env.DATAFORSEO_PASSWORD?.trim();
    if (!login || !password) {
      return NextResponse.json({
        provider,
        ok: false,
        reason: "DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD が未設定",
      });
    }
    const auth = Buffer.from(`${login}:${password}`).toString("base64");
    try {
      const res = await fetch("https://api.dataforseo.com/v3/appendix/user_data", {
        headers: { Authorization: `Basic ${auth}` },
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      const result = data?.tasks?.[0]?.result?.[0];
      return NextResponse.json({
        provider,
        ok: res.ok && data?.status_code === 20000,
        http_status: res.status,
        status_code: data?.status_code,
        status_message: data?.status_message,
        // ログイン文字列の長さだけ返す(値そのものは返さない)。設定確認の補助
        login_length: login.length,
        password_length: password.length,
        money_balance: result?.money?.balance ?? null,
      });
    } catch (e) {
      return NextResponse.json({
        provider,
        ok: false,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // SerpAPI: アカウント情報エンドポイントで疎通確認
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    return NextResponse.json({ provider, ok: false, reason: "SERPAPI_KEY が未設定" });
  }
  try {
    const res = await fetch(`https://serpapi.com/account?api_key=${apiKey}`, {
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    return NextResponse.json({
      provider,
      ok: res.ok,
      http_status: res.status,
      total_searches_left: data?.total_searches_left ?? null,
    });
  } catch (e) {
    return NextResponse.json({
      provider,
      ok: false,
      reason: e instanceof Error ? e.message : String(e),
    });
  }
}
