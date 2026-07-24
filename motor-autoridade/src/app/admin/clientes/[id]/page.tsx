import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeProgress } from "@/lib/progress/compute";
import { Card } from "@/components/ui";

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

function DnaBlock({ label, value }: { label: string; value: unknown }) {
  if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) return null;
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
      {Array.isArray(value) ? (
        <ul className="mt-0.5 list-inside list-disc text-sm text-ink-700">
          {value.map((v, i) => (
            <li key={i}>{String(v)}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-0.5 text-sm text-ink-700">{String(value)}</p>
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
      .limit(30),
    supabase
      .from("content_items")
      .select("id, title, status, published_at, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("content_formats")
      .select("content_item_id, format, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
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
      .limit(15),
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
    <div className="space-y-5">
      <Link href="/admin" className="text-sm text-ink-500">
        ← Clientes
      </Link>

      <div>
        <h1 className="font-serif text-2xl text-ink-900">{client.full_name ?? client.email}</h1>
        <p className="text-sm text-ink-500">
          {client.email} · {profile?.profession ?? "sem profissão"}
          {profile?.segment ? ` · ${profile.segment}` : ""}
        </p>
      </div>

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

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-ink-400">DNA Editorial</p>
          <span className="text-xs text-ink-400">
            {profile?.dna_generated_at ? `gerado em ${fmt(profile.dna_generated_at)}` : "não gerado"}
          </span>
        </div>
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
            <DnaBlock label="Ângulo único" value={dna.angulo_unico} />
          </div>
        ) : (
          <p className="text-sm text-ink-500">
            O DNA Editorial ainda não foi gerado — o cliente precisa concluir a anamnese (ou a
            geração falhou; veja as falhas de IA na visão geral).
          </p>
        )}
      </Card>

      <Card className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-ink-400">Perfil editorial</p>
        <p className="text-sm text-ink-700">
          Posicionamento: {profile?.positioning_recognition ?? "—"}
        </p>
        <p className="text-sm text-ink-700">
          Tom: {profile?.tone_profile?.length ? profile.tone_profile.join(", ") : profile?.tone_of_voice ?? "—"}
        </p>
        <p className="text-sm text-ink-700">
          Pilares: {profile?.main_themes?.length ? profile.main_themes.join(", ") : "—"}
        </p>
        <p className="text-sm text-ink-700">
          Proibidos: {profile?.forbidden_themes?.length ? profile.forbidden_themes.join(", ") : "—"}
        </p>
        <p className="text-sm text-ink-700">Valores: {profile?.core_values ?? "—"}</p>
        <p className="text-sm text-ink-700">Maior bloqueio: {profile?.main_block ?? "—"}</p>
      </Card>

      <section className="grid gap-3 sm:grid-cols-2">
        <Card className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-ink-400">
            Fontes ({activeSources.length})
          </p>
          {activeSources.length > 0 ? (
            <ul className="space-y-1">
              {activeSources.map((s, i) => (
                <li key={i} className="text-sm text-ink-700">
                  <span className="text-ink-400">[{PRIORITY_LABEL[s.priority] ?? s.priority}]</span>{" "}
                  {s.label ?? s.url} <span className="text-xs text-ink-400">({s.kind})</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-500">Nenhuma fonte informada.</p>
          )}
          {blockedSources.length > 0 ? (
            <p className="text-xs text-danger-700">
              Bloqueadas: {blockedSources.map((s) => s.label ?? s.url).join(", ")}
            </p>
          ) : null}
        </Card>
        <Card className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-ink-400">
            Referências de inspiração ({refs?.length ?? 0})
          </p>
          {refs && refs.length > 0 ? (
            <ul className="space-y-1">
              {refs.map((r, i) => (
                <li key={i} className="truncate text-sm text-ink-700">
                  {r.name ?? r.url} <span className="text-xs text-ink-400">({r.kind})</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-500">Nenhuma referência informada.</p>
          )}
        </Card>
      </section>

      <section>
        <h2 className="mb-2 font-serif text-lg text-ink-900">Histórico de pautas</h2>
        {opportunities && opportunities.length > 0 ? (
          <ul className="space-y-2">
            {opportunities.map((op) => (
              <li key={op.id}>
                <Card className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="truncate font-medium text-ink-900">{op.title}</span>
                    <span className="ml-3 shrink-0 rounded-full bg-sand-100 px-3 py-1 text-xs text-ink-500">
                      {OPP_STATUS_LABEL[op.status] ?? op.status}
                    </span>
                  </div>
                  <p className="text-xs text-ink-500">
                    {fmt(op.created_at)} · formato {FORMAT_LABEL[op.recommended_format] ?? op.recommended_format}
                    {op.editorial_angle ? ` · ângulo: ${op.editorial_angle}` : ""}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <Card className="text-center text-sm text-ink-500">Nenhuma pauta entregue ainda.</Card>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-serif text-lg text-ink-900">Conteúdos gerados</h2>
        {items && items.length > 0 ? (
          <ul className="space-y-2">
            {items.map((it) => (
              <li key={it.id}>
                <Card className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="truncate text-ink-900">{it.title}</span>
                    <span className="ml-3 shrink-0 rounded-full bg-sand-100 px-3 py-1 text-xs text-ink-500">
                      {STATUS_LABEL[it.status] ?? it.status}
                    </span>
                  </div>
                  <p className="text-xs text-ink-500">
                    {fmt(it.created_at)}
                    {formatsByItem.get(it.id)?.length
                      ? ` · formatos: ${formatsByItem.get(it.id)!.join(", ")}`
                      : ""}
                    {it.published_at ? ` · publicado em ${fmt(it.published_at)}` : ""}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <Card className="text-center text-sm text-ink-500">Sem conteúdos ainda.</Card>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-serif text-lg text-ink-900">Logs de geração (IA)</h2>
        {genLogs && genLogs.length > 0 ? (
          <ul className="space-y-1">
            {genLogs.map((l, i) => (
              <li key={i} className="text-xs text-ink-500">
                {fmt(l.created_at)} · {l.provider}/{l.model} · {l.scenario} ·{" "}
                {l.input_tokens}→{l.output_tokens} tokens · ${Number(l.cost_usd).toFixed(4)}
              </li>
            ))}
          </ul>
        ) : (
          <Card className="text-center text-sm text-ink-500">Nenhuma geração registrada.</Card>
        )}
      </section>
    </div>
  );
}
