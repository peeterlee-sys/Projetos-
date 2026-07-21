"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sun, BookOpen, TrendingUp, User } from "lucide-react";

const items = [
  { href: "/hoje", label: "Hoje", icon: Sun },
  { href: "/biblioteca", label: "Biblioteca", icon: BookOpen },
  { href: "/progresso", label: "Progresso", icon: TrendingUp },
  { href: "/perfil", label: "Perfil", icon: User },
];

/** Navegação inferior fixa (mobile-first). */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-sand-200 bg-sand-50/95 backdrop-blur">
      <ul className="mx-auto flex max-w-md items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom)]">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={`flex flex-col items-center gap-1 py-2.5 text-xs transition ${
                  active ? "text-brand-700" : "text-ink-400"
                }`}
              >
                <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
                <span className={active ? "font-medium" : ""}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
