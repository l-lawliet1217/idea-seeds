import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "idea seeds",
  description: "新規事業アイデアの種を蓄積・分析するツール",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
