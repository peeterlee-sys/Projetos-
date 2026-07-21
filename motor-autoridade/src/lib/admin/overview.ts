import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ClientHealth = "healthy" | "attention" | "risk";

export type ClientRow = {
  id: string;
  name: string | null;
  email: string;
  isActive: boolean;
  onboarded: boolean;
  publishedTotal: number;
  lastInteraction: string | null;
  daysSinceInteraction: number | null;
  health: ClientHealth;
};

export type AdminOverview = {
  totalClients: number;
  activeClients: number;
  newClientsThisWeek: number;
  activationRate: number; // onboarded / total (0..1)
  healthy: number;
  attention: number;
  risk: number;
  delivered: number;
  opened: number;
  produced: number;
  published: number;
  avgExecutionRate: number; // published / delivered
  totalCostUsd: number;
  errorCount: number;
  clients: ClientRow[];
};

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function healthFor(publishedTotal: number, days: number | null): ClientHealth {
  if (days == null || days >= 14) return "risk";
  if (days >= 7 || publishedTotal === 0) return "attention";
  return "healthy";
}

/**
 * Agrega métricas do dashboard administrativo (MÓDULO 13). A RLS delimita o
 * escopo automaticamente: admin vê o próprio tenant, super_admin vê tudo.
 */
export async function getAdminOverview(supabase: SupabaseClient): Promise<AdminOverview> {
  const weekStart = (() => {
    const d = new Date();
    const day = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() + ((day === 0 ? -6 : 1) - day));
    return d.toISOString().slice(0, 10) + "T00:00:00Z";
  })();

  const [{ data: clients }, { data: items }, { data: events }, { data: costs }, deliveries, opened, errors] =
    await Promise.all([
      supabase
        .from("users")
        .select("id, full_name, email, is_active, onboarded_at, created_at")
        .eq("role", "client")
        .is("deleted_at", null)
        .limit(1000),
      supabase.from("content_items").select("user_id, status, published_at").is("deleted_at", null).limit(5000),
      supabase
        .from("behavior_events")
        .select("user_id, created_at")
        .order("created_at", { ascending: false })
        .limit(5000),
      supabase.from("cost_logs").select("cost_usd").limit(10000),
      supabase.from("deliveries").select("id", { count: "exact", head: true }),
      supabase
        .from("behavior_events")
        .select("id", { count: "exact", head: true })
        .eq("event_type", "conteudo_aberto"),
      supabase.from("system_errors").select("id", { count: "exact", head: true }).is("resolved_at", null),
    ]);

  const clientList = clients ?? [];
  const itemList = items ?? [];
  const eventList = events ?? [];

  // Última interação por cliente (events já vêm ordenados desc).
  const lastByUser = new Map<string, string>();
  for (const e of eventList) if (!lastByUser.has(e.user_id)) lastByUser.set(e.user_id, e.created_at as string);

  // Publicados por cliente.
  const publishedByUser = new Map<string, number>();
  let publishedTotal = 0;
  for (const it of itemList) {
    if (it.status === "published") {
      publishedByUser.set(it.user_id, (publishedByUser.get(it.user_id) ?? 0) + 1);
      publishedTotal += 1;
    }
  }

  const rows: ClientRow[] = clientList.map((c) => {
    const last = lastByUser.get(c.id) ?? null;
    const days = daysSince(last);
    const pub = publishedByUser.get(c.id) ?? 0;
    return {
      id: c.id,
      name: c.full_name,
      email: c.email,
      isActive: c.is_active,
      onboarded: Boolean(c.onboarded_at),
      publishedTotal: pub,
      lastInteraction: last,
      daysSinceInteraction: days,
      health: healthFor(pub, days),
    };
  });

  const delivered = deliveries.count ?? 0;
  const total = rows.length;
  const onboardedCount = rows.filter((r) => r.onboarded).length;

  return {
    totalClients: total,
    activeClients: rows.filter((r) => r.isActive).length,
    newClientsThisWeek: clientList.filter((c) => (c.created_at as string) >= weekStart).length,
    activationRate: total > 0 ? onboardedCount / total : 0,
    healthy: rows.filter((r) => r.health === "healthy").length,
    attention: rows.filter((r) => r.health === "attention").length,
    risk: rows.filter((r) => r.health === "risk").length,
    delivered,
    opened: opened.count ?? 0,
    produced: itemList.length,
    published: publishedTotal,
    avgExecutionRate: delivered > 0 ? publishedTotal / delivered : 0,
    totalCostUsd: (costs ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0),
    errorCount: errors.count ?? 0,
    clients: rows.sort((a, b) => {
      const order = { risk: 0, attention: 1, healthy: 2 };
      return order[a.health] - order[b.health];
    }),
  };
}
