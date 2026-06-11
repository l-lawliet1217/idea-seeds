import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth/callback"];

export async function proxy(req: NextRequest) {
  // ローカル開発でSupabase Auth未設定でも動かすための退避フラグ
  if (process.env.AUTH_DISABLED === "true") {
    return NextResponse.next();
  }

  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = req.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!user) {
    if (isPublic) return res;
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // 社内メンバー限定: メールドメインを検査
  const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN ?? "mar-che.com";
  if (!user.email?.endsWith(`@${allowedDomain}`)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=domain", req.url));
  }

  if (path === "/login") {
    return NextResponse.redirect(new URL("/companies", req.url));
  }
  return res;
}

export const config = {
  // 静的アセットとcron(シークレット認証)はミドルウェア対象外
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/cron).*)"],
};
