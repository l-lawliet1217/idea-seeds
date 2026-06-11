"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabase } from "@/lib/supabase";

const ALLOWED_DOMAIN =
  process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN ?? "mar-che.com";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(
    searchParams.get("error") === "domain"
      ? `@${ALLOWED_DOMAIN} のメールアドレスのみ利用できます`
      : searchParams.get("error") === "auth"
        ? "認証に失敗しました。もう一度お試しください"
        : ""
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
      setError(`@${ALLOWED_DOMAIN} のメールアドレスのみ利用できます`);
      return;
    }
    setLoading(true);
    const { error } = await getSupabase().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  return (
    <div className="max-w-sm mx-auto mt-24">
      <h1 className="text-xl font-semibold text-center mb-1">
        AirERP Marketing Cloud
      </h1>
      <p className="text-sm text-gray-400 text-center mb-8">社内メンバー専用</p>

      {sent ? (
        <p className="text-sm text-gray-700 text-center bg-white border border-gray-200 rounded-xl p-6">
          {email} にログインリンクを送信しました。
          <br />
          メールを確認してください。
        </p>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-gray-200 rounded-xl p-6 space-y-3"
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={`you@${ALLOWED_DOMAIN}`}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
          <button
            disabled={loading}
            className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg text-sm disabled:opacity-40"
          >
            {loading ? "送信中..." : "ログインリンクを送信"}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}
    </div>
  );
}
