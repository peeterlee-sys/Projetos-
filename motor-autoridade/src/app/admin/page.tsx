import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAdminOverview, type ClientHealth } from "@/lib/admin/overview";
import { Card } from "@/components/ui";

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
const PLAN_LABEL: Record<string, string> = {
  trial: "Teste",
  active: "Ativo",
  suspended: "Suspenso",
  canceled: "Cancelado",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
  });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Metric({ label, value, hint, alert }: { label: string; value: string; hint?: string; alert?: boolean }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-ink-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${alert ? "text-danger-700" : "text-ink-900"}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-ink-500">{hint}</p> : null}
    </Card>
  );
}

export default async function AdminDashboard() {
  const supabase = await createClient();
  const o = await getAdminOverview(supabase);

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl text-ink-900">Visão geral</h1>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric label="Total de clientes" value={String(o.totalClients)} />
        <Metric label="Ativos" value={String(o.activeClients)} hint={`${o.inactiveClients} inativos`} />
        <Metric label="Em teste" value={String(o.trialClients)} hint={`${o.canceledClients} cancelados`} />
        <Metric label="Conteúdos hoje" value={String(o.generatedToday)} hint="gerados no dia (SP)" />
        <Metric label="Publicados" value={String(o.publishedTotal)} hint={`${o.delivered} pautas entregues`} />
        <Metric label="Taxa de publicação" value={`${Math.round(o.avgPublicationRate * 100)}%`} hint="publicados / entregues" />
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric label="Sem acesso há 7d+" value={String(o.noAccess7d)} alert={o.noAccess7d > 0} />
        <Metric label="Sem gerar conteúdo" value={String(o.neverGenerated)} alert={o.neverGenerated > 0} />
        <Metric label="Falhas de IA" value={String(o.aiFailures)} alert={o.aiFailures > 0} hint={`${o.makeFailures} falhas do Make`} />
        <Metric
          label="Última execução do Make"
          value={fmtDateTime(o.lastMakeExecution)}
          hint={o.lastMakeStatus ? `status: ${o.lastMakeStatus}` : undefined}
          alert={o.lastMakeStatus === "error"}
        />
        <Metric label="Consumo de IA" value={`$${o.totalCostUsd.toFixed(2)}`} hint="custo acumulado" />
      </section>

      <section>
        <h2 className="mb-3 font-serif text-lg text-ink-900">Clientes</h2>
        {o.clients.length === 0 ? (
          <Card className="text-center text-sm text-ink-500">Nenhum cliente ainda.</Card>
        ) : (
          <ul className="space-y-2">
            {o.clients.map((c) => (
              <li key={c.id}>
                <Link href={`/admin/clientes/${c.id}`}>
                  <Card className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink-900">{c.name ?? c.email}</p>
                        <p className="truncate text-xs text-ink-400">
                          {c.profession ?? "sem profissão"} · plano {PLAN_LABEL[c.plan] ?? c.plan}
                          {c.hasDna ? " · DNA ✓" : " · sem DNA"}
                        </p>
                      </div>
                      <span className={`ml-3 shrink-0 rounded-full px-3 py-1 text-xs ${HEALTH_STYLE[c.health]}`}>
                        {HEALTH_LABEL[c.health]}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
                      <span>Acesso: {fmtDate(c.lastAccess)}</span>
                      <span>Geração: {fmtDate(c.lastGeneration)}</span>
                      <span>Publicação: {fmtDate(c.lastPublication)}</span>
                      <span>
                        Meta: {c.publishedThisWeek}/{c.weeklyGoal} ({Math.round(c.weeklyPct * 100)}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-sand-200">
                      <div
                        className="h-full rounded-full bg-brand-700"
                        style={{ width: `${Math.round(c.weeklyPct * 100)}%` }}
                      />
                    </div>
                    {c.lastOpportunity ? (
                      <p className="truncate text-xs text-ink-400">Última pauta: {c.lastOpportunity}</p>
                    ) : null}
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
