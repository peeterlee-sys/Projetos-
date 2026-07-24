"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/admin", label: "Visão geral", exact: true },
  { href: "/admin/fontes", label: "Fontes", exact: false },
];

/** Abas de navegação do painel administrativo. */
export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-1 sm:flex">
      {items.map((it) => {
        const active = it.exact ? pathname === it.href : pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`rounded-full px-3 py-1.5 text-sm transition ${
              active ? "bg-brand-700 text-sand-50" : "text-ink-500 hover:bg-sand-200"
            }`}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
