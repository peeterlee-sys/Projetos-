import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";

// Filtros do MVP: Todos / Publicados / Gravados / Salvos.
const FILTERS = [
  { key: "all", label: "Todos", statuses: null },
  { key: "published", label: "Publicados", statuses: ["published"] },
  { key: "recorded", label: "Gravados", statuses: ["recorded"] },
  { key: "saved", label: "Salvos", statuses: ["saved", "suggested"] },
] as const;

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  in_production: { label: "Em produção", cls: "bg-gold-300/40 text-gold-700" },
  recorded: { label: "Gravado", cls: "bg-sand-200 text-ink-700" },
  published: { label: "Publicado", cls: "bg-success-100 text-brand-700" },
  suggested: { label: "Salvo", cls: "bg-sand-200 text-ink-700" },
  saved: { label: "Salvo", cls: "bg-sand-200 text-ink-700" },
  postponed: { label: "Adiado", cls: "bg-sand-200 text-ink-700" },
  rejected: { label: "Rejeitado", cls: "bg-danger-600/10 text-danger-700" },
  archived: { label: "Arquivado", cls: "bg-sand-200 text-ink-500" },
};

/** "hoje", "ontem", "N dias atrás" ou data curta. */
function relativeDay(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 7) return `${days} dias atrás`;
  return then.toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
}

export default async function BibliotecaPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const { f = "all" } = await searchParams;
  const active = FILTERS.find((x) => x.key === f) ?? FILTERS[0];

  const user = await requireUser();
  const supabase = await createClient();

  let query = supabase
    .from("content_items")
    .select("id, title, theme, status, published_at, created_at")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  if (active.statuses) query = query.in("status", active.statuses);

  const { data: items } = await query;

  return (
    <main className="px-5 pt-8">
      <h1 className="mb-4 font-serif text-3xl text-ink-900">Biblioteca</h1>

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((filter) => {
          const isActive = active.key === filter.key;
          return (
            <Link
              key={filter.key}
              href={filter.key === "all" ? "/biblioteca" : `/biblioteca?f=${filter.key}`}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition ${
                isActive ? "bg-ink-900 text-sand-50" : "bg-white text-ink-700 ring-1 ring-sand-200"
              }`}
            >
              {filter.label}
            </Link>
          );
        })}
      </div>

      {items && items.length > 0 ? (
        <ul className="space-y-3">
          {items.map((item) => {
            const badge = STATUS_BADGE[item.status] ?? {
              label: item.status,
              cls: "bg-sand-200 text-ink-700",
            };
            const when = relativeDay((item.published_at as string) ?? (item.created_at as string));
            return (
              <li key={item.id}>
                <Link
                  href={`/conteudo/${item.id}`}
                  className="flex items-start justify-between gap-3 rounded-[24px] bg-white p-5 ring-1 ring-sand-200 transition hover:ring-sand-300"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink-900">{item.title}</p>
                    <p className="mt-0.5 text-sm text-ink-500">
                      {item.theme ? `${item.theme} · ` : ""}
                      {when}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${badge.cls}`}
                  >
                    {badge.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-[24px] bg-white p-8 text-center ring-1 ring-sand-200">
          <p className="text-sm text-ink-500">
            {active.key === "all"
              ? "Nada por aqui ainda. Assim que você começar uma pauta, ela aparece na sua biblioteca."
              : "Nenhum conteúdo neste filtro."}
          </p>
        </div>
      )}
    </main>
  );
}
