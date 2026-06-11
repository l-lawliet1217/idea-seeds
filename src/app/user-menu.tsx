"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";

export default function UserMenu() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    getSupabase()
      .auth.getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null))
      .catch(() => setEmail(null));
  }, []);

  if (!email) return null;

  return (
    <div className="ml-auto flex items-center gap-3 text-xs text-gray-400">
      <span>{email}</span>
      <button
        onClick={async () => {
          await getSupabase().auth.signOut();
          location.href = "/login";
        }}
        className="hover:text-gray-700"
      >
        ログアウト
      </button>
    </div>
  );
}
