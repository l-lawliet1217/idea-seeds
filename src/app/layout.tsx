import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "AirERP Marketing Cloud",
  description: "SEO事業の営業・マーケティング統合管理",
};

const NAV_ITEMS = [
  { href: "/companies", label: "企業" },
  { href: "/companies/import", label: "取り込み" },
  { href: "/segments", label: "セグメント" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-8">
            <Link href="/companies" className="font-semibold tracking-tight">
              AirERP Marketing Cloud
            </Link>
            <nav className="flex gap-5 text-sm text-gray-500">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="hover:text-gray-900 transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
