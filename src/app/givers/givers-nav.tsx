"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/givers", label: "Friends" },
  { href: "/givers/matching", label: "Matching" },
  { href: "/givers/outreach", label: "Outreach" },
  { href: "/givers/triggers", label: "Triggers" },
];

export default function GiversNav() {
  const pathname = usePathname();
  return (
    <div className="flex gap-1 text-sm border-b border-gray-200">
      {ITEMS.map((item) => {
        const active =
          item.href === "/givers"
            ? pathname === "/givers" || /^\/givers\/[0-9a-f-]{36}$/.test(pathname)
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`px-4 py-2 border-b-2 -mb-px transition-colors ${
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
