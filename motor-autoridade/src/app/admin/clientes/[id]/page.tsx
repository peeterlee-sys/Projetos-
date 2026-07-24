import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeProgress } from "@/lib/progress/compute";

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
const OPP_STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  delivered: "Entregue",
  opened: "Aberta",
  chosen: "Escolhida",
  dismissed: "Descartada",
  expired: "Expirada",
};
const FORMAT_LABEL: Record<string, string> = {
  video: "Vídeo",
  carousel: "Carrossel",
  post: "Post",
  story: "Story",
  linkedin: "LinkedIn",
};
const PRIORITY_LABEL: Record<string, string> = { high: "Alta", medium: "Média", low: "Baixa" };
const STATUS_BADGE: Record<string, string> = {
  published: "bg-success-100 text-brand-700",
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Panel({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white/80 p-5 ring-1 ring-sand-200">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-400">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function DnaBlock({ label, value }: { label: string; value: unknown }) {
  if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) return null;
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{label}</p>
      {Array.isArray(value) ? (
        <ul className="mt-0.5 list-inside list-disc text-sm text-ink-700">
          {value.map((v, i) => (
            <li key={i}>{String(v)}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-0.5 text-sm leading-relaxed text-ink-700">{String(value)}</p>
      )}
    </div>
  );
}

export default async function ClientDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: client } = await supabase
    .from("users")
    .select("id, full_name, email, is_active, onboarded_at, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!client) notFound();

  const [
    { data: profile },
    { data: prefs },
    progress,
    { data: opportunities },
    { data: items },
    { data: formats },
    { data: sources },
    { data: refs },
    { data: costs },
    { data: genLogs },
    { data: publications },
  ] = await Promise.all([
    supabase
      .from("client_profiles")
      .select(
        "display_name, profession, segment, tone_of_voice, tone_profile, main_themes, forbidden_themes, main_block, editorial_dna, dna_generated_at, positioning_recognition, core_values"
      )
      .eq("user_id", id)
      .maybeSingle(),
    supabase.from("client_preferences").select("weekly_goal, preferred_formats").eq("user_id", id).maybeSingle(),
    computeProgress(supabase, id),
    supabase
      .from("daily_opportunities")
      .select("id, title, theme, editorial_angle, status, recommended_format, opportunity_date, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("content_items")
      .select("id, title, status, published_at, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("content_formats")
      .select("content_item_id, format, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(150),
    supabase
      .from("influence_sources")
      .select("kind, label, url, priority, is_blocked")
      .eq("user_id", id)
      .limit(100),
    supabase.from("inspiration_refs").select("kind, name, url").eq("user_id", id).limit(10),
    supabase.from("cost_logs").select("cost_usd").eq("user_id", id).limit(5000),
    supabase
      .from("cost_logs")
      .select("provider, model, scenario, input_tokens, output_tokens, cost_usd, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("content_items")
      .select("id, title, published_at")
      .eq("user_id", id)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(20),
  ]);

  const cost = (costs ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
  const dna = (profile?.editorial_dna ?? {}) as Record<string, unknown>;
  const hasDna = Object.keys(dna).length > 0;
  const formatsByItem = new Map<string, string[]>();
  for (const f of formats ?? []) {
    const list = formatsByItem.get(f.content_item_id) ?? [];
    list.push(FORMAT_LABEL[f.format] ?? f.format);
    formatsByItem.set(f.content_item_id, list);
  }
  const activeSources = (sources ?? []).filter((s) => !s.is_blocked);
  const blockedSources = (sources ?? []).filter((s) => s.is_blocked);

  return (
    <div className="space-y-6">
      <Link href="/admin" className="text-sm text-ink-500 hover:text-ink-900">
        ← Voltar para clientes
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl text-ink-900">{client.full_name ?? client.email}</h1>
          <p className="text-sm text-ink-500">
            {client.email} · {profile?.profession ?? "sem profissão"}
            {profile?.segment ? ` · ${profile.segment}` : ""} ·{" "}
            {client.is_active ? "ativo" : "inativo"}
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            label: "Publicados (semana)",
            value: `${progress.publishedCount}/${prefs?.weekly_goal ?? progress.target}`,
          },
          { label: "Execução", value: `${Math.round(progress.executionRate * 100)}%` },
          { label: "Sequência", value: `${progress.currentStreak} sem` },
          { label: "Custo de IA", value: `US$ ${cost.toFixed(2)}` },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl bg-white/80 p-4 ring-1 ring-sand-200">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{k.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-ink-900">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Coluna principal */}
        <div className="space-y-6 lg:col-span-2">
          <Panel title={`Histórico de pautas (${opportunities?.length ?? 0})`}>
            {opportunities && opportunities.length > 0 ? (
              <ul className="space-y-2">
                {opportunities.map((op) => (
                  <li key={op.id} className="rounded-xl bg-sand-50 p-3 ring-1 ring-sand-200">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-medium text-ink-900">{op.title}</span>
                      <span className="shrink-0 rounded-full bg-sand-100 px-2.5 py-0.5 text-xs text-ink-500">
                        {OPP_STATUS_LABEL[op.status] ?? op.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-ink-500">
                      {fmt(op.created_at)} · {FORMAT_LABEL[op.recommended_format] ?? op.recommended_format}
                      {op.editorial_angle ? ` · ângulo: ${op.editorial_angle}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-500">Nenhuma pauta entregue ainda.</p>
            )}
          </Panel>

          <Panel title={`Conteúdos gerados (${items?.length ?? 0})`}>
            {items && items.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-ink-400">
                      <th className="py-2 pr-3 font-medium">Título</th>
                      <th className="py-2 pr-3 font-medium">Formatos</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2 font-medium">Criado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.id} className="border-t border-sand-200">
                        <td className="py-2 pr-3 text-ink-900">{it.title}</td>
                        <td className="py-2 pr-3 text-ink-500">
                          {formatsByItem.get(it.id)?.join(", ") ?? "—"}
                        </td>
                        <td className="py-2 pr-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[it.status] ?? "bg-sand-100 text-ink-500"}`}
                          >
                            {STATUS_LABEL[it.status] ?? it.status}
                          </span>
                        </td>
                        <td className="py-2 text-ink-500 tabular-nums">{fmt(it.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-ink-500">Sem conteúdos ainda.</p>
            )}
          </Panel>

          <Panel title={`Histórico de publicação (${publications?.length ?? 0})`}>
            {publications && publications.length > 0 ? (
              <ul className="space-y-1.5">
                {publications.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-ink-900">{p.title}</span>
                    <span className="shrink-0 text-ink-500 tabular-nums">{fmt(p.published_at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-500">Nenhuma publicação registrada.</p>
            )}
          </Panel>

          <Panel title={`Logs de geração — IA (${genLogs?.length ?? 0})`}>
            {genLogs && genLogs.length > 0 ? (
              <ul className="space-y-1">
                {genLogs.map((l, i) => (
                  <li key={i} className="font-mono text-xs text-ink-500">
                    {fmt(l.created_at)} · {l.provider}/{l.model} · {l.scenario} · {l.input_tokens}→
                    {l.output_tokens} tok · ${Number(l.cost_usd).toFixed(4)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-500">Nenhuma geração registrada.</p>
            )}
          </Panel>
        </div>

        {/* Coluna lateral */}
        <div className="space-y-6">
          <Panel
            title="DNA Editorial"
            right={
              <span className="text-[11px] text-ink-400">
                {profile?.dna_generated_at ? fmt(profile.dna_generated_at) : "não gerado"}
              </span>
            }
          >
            {hasDna ? (
              <div className="space-y-3">
                <DnaBlock label="Identidade" value={dna.identidade} />
                <DnaBlock label="Objetivos" value={dna.objetivos} />
                <DnaBlock label="Público" value={dna.publico} />
                <DnaBlock label="Pilares" value={dna.pilares} />
                <DnaBlock label="Tom" value={dna.tom} />
                <DnaBlock label="Valores" value={dna.valores} />
                <DnaBlock label="Assuntos proibidos" value={dna.assuntos_proibidos} />
                <DnaBlock label="Fontes prioritárias" value={dna.fontes_prioritarias} />
                <DnaBlock label="Referências" value={dna.referencias} />
                <DnaBlock label="Estilo editorial" value={dna.estilo_editorial} />
                <DnaBlock label="Formatos preferidos" value={dna.formatos_preferidos} />
                <div className="rounded-xl bg-gold-300/20 p-3">
                  <DnaBlock label="Ângulo único" value={dna.angulo_unico} />
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-500">
                Ainda não gerado. O cliente precisa concluir a anamnese — ou a geração falhou (veja
                Falhas de IA na visão geral).
              </p>
            )}
          </Panel>

          <Panel title="Perfil editorial">
            <div className="space-y-2 text-sm">
              <p className="text-ink-700">
                <span className="text-ink-400">Posicionamento:</span>{" "}
                {profile?.positioning_recognition ?? "—"}
              </p>
              <p className="text-ink-700">
                <span className="text-ink-400">Tom:</span>{" "}
                {profile?.tone_profile?.length
                  ? profile.tone_profile.join(", ")
                  : profile?.tone_of_voice ?? "—"}
              </p>
              <p className="text-ink-700">
                <span className="text-ink-400">Pilares:</span>{" "}
                {profile?.main_themes?.length ? profile.main_themes.join(", ") : "—"}
              </p>
              <p className="text-ink-700">
                <span className="text-ink-400">Proibidos:</span>{" "}
                {profile?.forbidden_themes?.length ? profile.forbidden_themes.join(", ") : "—"}
              </p>
              <p className="text-ink-700">
                <span className="text-ink-400">Valores:</span> {profile?.core_values ?? "—"}
              </p>
              <p className="text-ink-700">
                <span className="text-ink-400">Maior bloqueio:</span> {profile?.main_block ?? "—"}
              </p>
            </div>
          </Panel>

          <Panel title={`Fontes utilizadas (${activeSources.length})`}>
            {activeSources.length > 0 ? (
              <ul className="space-y-1.5 text-sm">
                {activeSources.map((s, i) => (
                  <li key={i} className="text-ink-700">
                    <span className="text-ink-400">[{PRIORITY_LABEL[s.priority] ?? s.priority}]</span>{" "}
                    {s.label ?? s.url} <span className="text-xs text-ink-400">({s.kind})</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-500">Nenhuma fonte própria — usa a matriz do segmento.</p>
            )}
            {blockedSources.length > 0 ? (
              <p className="mt-2 text-xs text-danger-700">
                Bloqueadas: {blockedSources.map((s) => s.label ?? s.url).join(", ")}
              </p>
            ) : null}
          </Panel>

          <Panel title={`Referências de inspiração (${refs?.length ?? 0})`}>
            {refs && refs.length > 0 ? (
              <ul className="space-y-1.5 text-sm">
                {refs.map((r, i) => (
                  <li key={i} className="truncate text-ink-700">
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer" className="hover:text-brand-700">
                        {r.name ?? r.url}
                      </a>
                    ) : (
                      (r.name ?? "—")
                    )}{" "}
                    <span className="text-xs text-ink-400">({r.kind})</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-500">Nenhuma referência informada.</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
