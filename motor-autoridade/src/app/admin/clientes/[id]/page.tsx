import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeProgress } from "@/lib/progress/compute";
import { Card } from "@/components/ui";

const STATUS_LABEL: Record<string, string> = {
  suggested: "Sugerido",
  in_production: "Produzindo",
  recorded: "Gravado",
  published: "Publicado",
  rejected: "Rejeitado",
  archived: "Arquivado",
};

export default async function ClientDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: client } = await supabase
    .from("users")
    .select("id, full_name, email, is_active, onboarded_at, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!client) notFound();

  const [{ data: profile }, { data: prefs }, progress, { data: items }, { data: costs }, { data: blocks }] =
    await Promise.all([
      supabase
        .from("client_profiles")
        .select("display_name, profession, tone_of_voice, main_themes, main_block")
        .eq("user_id", id)
        .maybeSingle(),
      supabase.from("client_preferences").select("weekly_goal").eq("user_id", id).maybeSingle(),
      computeProgress(supabase, id),
      supabase
        .from("content_items")
        .select("id, title, status, created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.from("cost_logs").select("cost_usd").eq("user_id", id).limit(5000),
      supabase
        .from("behavior_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", id)
        .eq("event_type", "bloqueio_informado"),
    ]);

  const cost = (costs ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);

  return (
    <div className="space-y-5">
      <Link href="/admin" className="text-sm text-ink-500">
        ← Clientes
      </Link>

      <div>
        <h1 className="font-serif text-2xl text-ink-900">{client.full_name ?? client.email}</h1>
        <p className="text-sm text-ink-500">{client.email}</p>
      </div>

      <Card className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-ink-400">Perfil editorial</p>
        <p className="text-sm text-ink-700">Profissão: {profile?.profession ?? "—"}</p>
        <p className="text-sm text-ink-700">Tom de voz: {profile?.tone_of_voice ?? "—"}</p>
        <p className="text-sm text-ink-700">
          Temas: {profile?.main_themes?.length ? profile.main_themes.join(", ") : "—"}
        </p>
        <p className="text-sm text-ink-700">Maior bloqueio: {profile?.main_block ?? "—"}</p>
      </Card>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <p className="text-xs uppercase tracking-wide text-ink-400">Publicados (semana)</p>
          <p className="mt-1 text-2xl font-semibold text-ink-900">
            {progress.publishedCount}/{prefs?.weekly_goal ?? progress.target}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-ink-400">Execução</p>
          <p className="mt-1 text-2xl font-semibold text-ink-900">
            {Math.round(progress.executionRate * 100)}%
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-ink-400">Sequência</p>
          <p className="mt-1 text-2xl font-semibold text-ink-900">{progress.currentStreak} sem</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-ink-400">Custo de IA</p>
          <p className="mt-1 text-2xl font-semibold text-ink-900">${cost.toFixed(2)}</p>
        </Card>
      </section>

      <Card>
        <p className="text-xs uppercase tracking-wide text-ink-400">Bloqueios informados</p>
        <p className="mt-1 text-ink-900">{blocks?.length ?? 0}</p>
      </Card>

      <section>
        <h2 className="mb-2 font-serif text-lg text-ink-900">Conteúdos recentes</h2>
        {items && items.length > 0 ? (
          <ul className="space-y-2">
            {items.map((it) => (
              <li key={it.id}>
                <Card className="flex items-center justify-between">
                  <span className="truncate text-ink-900">{it.title}</span>
                  <span className="ml-3 shrink-0 rounded-full bg-sand-100 px-3 py-1 text-xs text-ink-500">
                    {STATUS_LABEL[it.status] ?? it.status}
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <Card className="text-center text-sm text-ink-500">Sem conteúdos ainda.</Card>
        )}
      </section>
    </div>
  );
}
