import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { AdminNav } from "./AdminNav";
import { TakeMark } from "@/components/brand/TakeLogo";

/** Área administrativa — só admin e super_admin. Otimizada para desktop. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin" && user.role !== "super_admin") redirect("/hoje");

  return (
    <div className="min-h-dvh bg-sand-100">
      <header className="sticky top-0 z-20 border-b border-sand-200 bg-sand-50/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="flex items-center gap-2">
              <TakeMark size={26} />
              <span className="font-serif text-lg text-brand-700">Take · Admin</span>
            </Link>
            <AdminNav />
          </div>
          <div className="flex items-center gap-4 text-sm text-ink-500">
            <span className="hidden sm:inline">{user.full_name ?? user.email}</span>
            <span className="rounded-full bg-brand-700/10 px-3 py-1 text-xs text-brand-700">
              {user.role === "super_admin" ? "Super admin" : "Admin"}
            </span>
            <Link href="/hoje" className="underline underline-offset-2 hover:text-ink-900">
              Ver app
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
