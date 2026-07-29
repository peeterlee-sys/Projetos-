"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "./items";
import { BrandLogo } from "@/components/brand/Logo";

/**
 * Navegação lateral do desktop. O assessor costuma abrir o painel no
 * computador para revisar e publicar o que o vereador gerou no WhatsApp —
 * barra inferior de celular fica estranha nessa largura.
 */
export function SideNav() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-sand-200 bg-sand-50/60 px-4 py-6 md:block">
      <Link href={navItems[0].href} className="mb-8 block px-2">
        <BrandLogo size={28} />
      </Link>
      <ul className="space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <li key={href}>
              <Link
                href={href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                  active
                    ? "bg-brand-700/10 font-medium text-brand-700"
                    : "text-ink-500 hover:bg-sand-100 hover:text-ink-900"
                }`}
              >
                <Icon size={19} strokeWidth={active ? 2.3 : 1.8} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
