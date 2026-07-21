import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";

/** Área administrativa — só admin e super_admin. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin" && user.role !== "super_admin") redirect("/hoje");

  return (
    <div className="mx-auto min-h-dvh max-w-3xl">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-sand-200 bg-sand-50/95 px-5 py-4 backdrop-blur">
        <Link href="/admin" className="font-serif text-lg text-brand-700">
          Motor · Admin
        </Link>
        <div className="flex items-center gap-4 text-sm text-ink-500">
          <span className="rounded-full bg-sand-100 px-3 py-1 text-xs">
            {user.role === "super_admin" ? "Super admin" : "Admin"}
          </span>
          <Link href="/hoje" className="underline">
            App
          </Link>
        </div>
      </header>
      <main className="px-5 py-6">{children}</main>
    </div>
  );
}
