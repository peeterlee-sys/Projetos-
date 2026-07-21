import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { Card } from "@/components/ui";

const STATUS_FILTERS = [
  { key: "all", label: "Todos" },
  { key: "in_production", label: "Produzindo" },
  { key: "recorded", label: "Gravados" },
  { key: "published", label: "Publicados" },
  { key: "rejected", label: "Rejeitados" },
  { key: "archived", label: "Arquivados" },
] as const;

const STATUS_LABEL: Record<string, string> = {
  suggested: "Sugerido",
  saved: "Salvo",
  opened: "Aberto",
  read: "Lido",
  in_production: "Produzindo",
  recorded: "Gravado",
  published: "Publicado",
  postponed: "Adiado",
  rejected: "Rejeitado",
  archived: "Arquivado",
};

export default async function BibliotecaPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { status = "all", q = "" } = await searchParams;
  const user = await requireUser();
  const supabase = await createClient();

  let query = supabase
    .from("content_items")
    .select("id, title, theme, status, published_at, created_at")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  if (status !== "all") query = query.eq("status", status);
  if (q.trim()) query = query.or(`title.ilike.%${q}%,theme.ilike.%${q}%`);

  const { data: items } = await query;

  return (
    <main className="px-5 pt-8">
      <h1 className="mb-4 font-serif text-3xl text-ink-900">Biblioteca</h1>

      <form className="mb-4">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Buscar por título ou tema…"
          className="w-full rounded-2xl border border-sand-300 bg-sand-50 px-4 py-3 text-ink-900 outline-none focus:border-brand-700"
        />
        {status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
      </form>

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {STATUS_FILTERS.map((f) => {
          const params = new URLSearchParams();
          if (f.key !== "all") params.set("status", f.key);
          if (q) params.set("q", q);
          const href = `/biblioteca${params.toString() ? `?${params}` : ""}`;
          const active = status === f.key;
          return (
            <Link
              key={f.key}
              href={href}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm transition ${
                active ? "bg-brand-700 text-sand-50" : "bg-sand-100 text-ink-700"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {items && items.length > 0 ? (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id}>
              <Link href={`/conteudo/${item.id}`}>
                <Card className="flex items-center justify-between">
                  <div className="min-w-0">
                    {item.theme ? (
                      <p className="truncate text-xs uppercase tracking-wide text-gold-700">
                        {item.theme}
                      </p>
                    ) : null}
                    <p className="truncate font-medium text-ink-900">{item.title}</p>
                  </div>
                  <span className="ml-3 shrink-0 rounded-full bg-sand-100 px-3 py-1 text-xs text-ink-500">
                    {STATUS_LABEL[item.status] ?? item.status}
                  </span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Card className="text-center">
          <p className="text-sm text-ink-500">
            Nenhum conteúdo por aqui ainda. Assim que você começar uma pauta, ela aparece nesta
            biblioteca.
          </p>
        </Card>
      )}
    </main>
  );
}
