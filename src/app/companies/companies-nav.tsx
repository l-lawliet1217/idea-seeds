"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/companies/business-models", label: "ビジネスモデル" },
  { href: "/companies/industries", label: "特化先" },
  { href: "/companies/segments", label: "ビジネスモデル×特化先" },
  { href: "/companies", label: "企業" },
  { href: "/companies/contacts", label: "企業担当者" },
  { href: "/companies/partners", label: "パートナー" },
];

export default function CompaniesNav() {
  const pathname = usePathname();
  return (
    <div className="flex gap-1 text-sm border-b border-gray-200 overflow-x-auto">
      {ITEMS.map((item) => {
        const active =
          item.href === "/companies"
            ? pathname === "/companies" ||
              /^\/companies\/[0-9a-f-]{36}$/.test(pathname)
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`px-4 py-2 border-b-2 -mb-px whitespace-nowrap transition-colors ${
              active
                ? "border-gray-900 text-gray-900 font-medium"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
