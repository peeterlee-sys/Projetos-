import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAdminOverview, type ClientHealth, type ClientRow } from "@/lib/admin/overview";

const HEALTH_STYLE: Record<ClientHealth, string> = {
  healthy: "bg-success-100 text-brand-700",
  attention: "bg-gold-300/40 text-gold-700",
  risk: "bg-danger-600/10 text-danger-700",
};
const HEALTH_LABEL: Record<ClientHealth, string> = {
  healthy: "Saudável",
  attention: "Atenção",
  risk: "Risco",
};
const PLAN_STYLE: Record<string, string> = {
  active: "bg-success-100 text-brand-700",
  trial: "bg-gold-300/40 text-gold-700",
  suspended: "bg-sand-200 text-ink-500",
  canceled: "bg-danger-600/10 text-danger-700",
};
const PLAN_LABEL: Record<string, string> = {
  trial: "Teste",
  active: "Ativo",
  suspended: "Suspenso",
  canceled: "Cancelado",
};

function date(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
  });
}
function dateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Cartão de métrica. `tone` colore o número quando é um alerta/ok. */
function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "alert" | "good";
}) {
  const color =
    tone === "alert" ? "text-danger-700" : tone === "good" ? "text-brand-700" : "text-ink-900";
  return (
    <div className="rounded-2xl bg-white/80 p-4 ring-1 ring-sand-200">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-400">{children}</h2>;
}

function Bar({ pct }: { pct: number }) {
  const p = Math.round(pct * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-sand-200">
        <div
          className={`h-full rounded-full ${p >= 100 ? "bg-brand-700" : p > 0 ? "bg-gold-500" : "bg-sand-300"}`}
          style={{ width: `${Math.min(100, p)}%` }}
        />
      </div>
      <span className="tabular-nums text-xs text-ink-500">{p}%</span>
    </div>
  );
}

function ClientTableRow({ c }: { c: ClientRow }) {
  return (
    <tr className="border-t border-sand-200 transition hover:bg-sand-100/60">
      <td className="whitespace-nowrap px-3 py-3">
        <Link href={`/admin/clientes/${c.id}`} className="block">
          <span className="font-medium text-ink-900 hover:text-brand-700">{c.name ?? c.email}</span>
          <span className="block text-xs text-ink-400">{c.email}</span>
        </Link>
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-sm text-ink-700">{c.profession ?? "—"}</td>
      <td className="px-3 py-3">
        <span className={`rounded-full px-2.5 py-0.5 text-xs ${PLAN_STYLE[c.plan] ?? "bg-sand-200 text-ink-500"}`}>
          {PLAN_LABEL[c.plan] ?? c.plan}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-sm text-ink-500 tabular-nums">{date(c.lastAccess)}</td>
      <td className="whitespace-nowrap px-3 py-3 text-sm text-ink-500 tabular-nums">{date(c.lastGeneration)}</td>
      <td className="whitespace-nowrap px-3 py-3 text-sm text-ink-500 tabular-nums">{date(c.lastPublication)}</td>
      <td className="px-3 py-3">
        <span className={`rounded-full px-2.5 py-0.5 text-xs ${HEALTH_STYLE[c.health]}`}>
          {HEALTH_LABEL[c.health]}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-sm text-ink-700 tabular-nums">
        {c.publishedThisWeek}/{c.weeklyGoal}
      </td>
      <td className="px-3 py-3">
        <Bar pct={c.weeklyPct} />
      </td>
      <td className="max-w-[16rem] px-3 py-3">
        <span className="block truncate text-sm text-ink-500" title={c.lastOpportunity ?? ""}>
          {c.lastOpportunity ?? "—"}
        </span>
      </td>
    </tr>
  );
}

export default async function AdminDashboard() {
  const supabase = await createClient();
  const o = await getAdminOverview(supabase);

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-serif text-3xl text-ink-900">Visão geral</h1>
          <p className="mt-1 text-sm text-ink-500">
            Panorama de todos os clientes, produção e saúde da operação.
          </p>
        </div>
        <Link
          href="/admin/fontes"
          className="rounded-full bg-brand-700 px-4 py-2 text-sm text-sand-50 transition hover:bg-brand-800"
        >
          Gerenciar fontes
        </Link>
      </div>

      {/* Clientes */}
      <section>
        <SectionTitle>Clientes</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Total" value={String(o.totalClients)} />
          <Stat label="Ativos" value={String(o.activeClients)} tone="good" />
          <Stat label="Inativos" value={String(o.inactiveClients)} />
          <Stat label="Em teste" value={String(o.trialClients)} />
          <Stat label="Cancelados" value={String(o.canceledClients)} tone={o.canceledClients > 0 ? "alert" : "neutral"} />
        </div>
      </section>

      {/* Produção */}
      <section>
        <SectionTitle>Produção</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Conteúdos hoje" value={String(o.generatedToday)} hint="gerados no dia (SP)" />
          <Stat label="Publicados" value={String(o.publishedTotal)} hint="total acumulado" />
          <Stat label="Taxa média de publicação" value={`${Math.round(o.avgPublicationRate * 100)}%`} hint="publicados / entregues" />
          <Stat label="Pautas entregues" value={String(o.delivered)} />
        </div>
      </section>

      {/* Saúde e operação */}
      <section>
        <SectionTitle>Alertas e operação</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Sem acesso 7d+" value={String(o.noAccess7d)} tone={o.noAccess7d > 0 ? "alert" : "good"} />
          <Stat label="Sem gerar conteúdo" value={String(o.neverGenerated)} tone={o.neverGenerated > 0 ? "alert" : "good"} />
          <Stat label="Falhas de IA" value={String(o.aiFailures)} tone={o.aiFailures > 0 ? "alert" : "good"} />
          <Stat label="Falhas do Make" value={String(o.makeFailures)} tone={o.makeFailures > 0 ? "alert" : "good"} />
          <Stat
            label="Última execução Make"
            value={dateTime(o.lastMakeExecution)}
            hint={o.lastMakeStatus ? `status: ${o.lastMakeStatus}` : "sem registro"}
            tone={o.lastMakeStatus === "error" ? "alert" : "neutral"}
          />
        </div>
        <div className="mt-3">
          <Stat label="Consumo de IA (acumulado)" value={`US$ ${o.totalCostUsd.toFixed(2)}`} />
        </div>
      </section>

      {/* Lista de clientes */}
      <section>
        <SectionTitle>Lista de clientes</SectionTitle>
        {o.clients.length === 0 ? (
          <div className="rounded-2xl bg-white/80 p-8 text-center text-sm text-ink-500 ring-1 ring-sand-200">
            Nenhum cliente ainda.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl bg-white/80 ring-1 ring-sand-200">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-ink-400">
                  <th className="px-3 py-3 font-medium">Nome</th>
                  <th className="px-3 py-3 font-medium">Profissão</th>
                  <th className="px-3 py-3 font-medium">Plano</th>
                  <th className="px-3 py-3 font-medium">Últ. acesso</th>
                  <th className="px-3 py-3 font-medium">Últ. geração</th>
                  <th className="px-3 py-3 font-medium">Últ. publicação</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Meta</th>
                  <th className="px-3 py-3 font-medium">Concluído</th>
                  <th className="px-3 py-3 font-medium">Última pauta</th>
                </tr>
              </thead>
              <tbody>
                {o.clients.map((c) => (
                  <ClientTableRow key={c.id} c={c} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-ink-400">Clique em um cliente para ver o detalhamento completo.</p>
      </section>
    </div>
  );
}
