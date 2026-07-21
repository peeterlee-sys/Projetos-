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

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink-900">{value}</p>
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
        <Metric label="Clientes ativos" value={String(o.activeClients)} hint={`${o.totalClients} no total`} />
        <Metric label="Novos (semana)" value={String(o.newClientsThisWeek)} />
        <Metric label="Taxa de ativação" value={`${Math.round(o.activationRate * 100)}%`} hint="onboarding concluído" />
        <Metric label="Saudáveis" value={String(o.healthy)} />
        <Metric label="Em atenção" value={String(o.attention)} />
        <Metric label="Em risco" value={String(o.risk)} />
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Entregues" value={String(o.delivered)} />
        <Metric label="Abertos" value={String(o.opened)} />
        <Metric label="Produzidos" value={String(o.produced)} />
        <Metric label="Publicados" value={String(o.published)} />
        <Metric label="Execução média" value={`${Math.round(o.avgExecutionRate * 100)}%`} />
        <Metric label="Consumo de IA" value={`$${o.totalCostUsd.toFixed(2)}`} hint="custo acumulado" />
        <Metric label="Erros abertos" value={String(o.errorCount)} />
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
                  <Card className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink-900">{c.name ?? c.email}</p>
                      <p className="truncate text-xs text-ink-400">
                        {c.publishedTotal} publicados ·{" "}
                        {c.daysSinceInteraction == null
                          ? "sem interação"
                          : `há ${c.daysSinceInteraction}d`}
                      </p>
                    </div>
                    <span className={`ml-3 shrink-0 rounded-full px-3 py-1 text-xs ${HEALTH_STYLE[c.health]}`}>
                      {HEALTH_LABEL[c.health]}
                    </span>
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
