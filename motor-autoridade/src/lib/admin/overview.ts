import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ClientHealth = "healthy" | "attention" | "risk";

export type ClientRow = {
  id: string;
  name: string | null;
  email: string;
  profession: string | null;
  segment: string | null;
  plan: string;                     // status do tenant: trial | active | suspended | canceled
  isActive: boolean;
  onboarded: boolean;
  hasDna: boolean;
  weeklyGoal: number;
  publishedThisWeek: number;
  weeklyPct: number;                // 0..1
  publishedTotal: number;
  lastAccess: string | null;        // último evento de comportamento
  lastGeneration: string | null;    // último content_item criado
  lastPublication: string | null;
  lastOpportunity: string | null;   // título da última pauta
  daysSinceAccess: number | null;
  health: ClientHealth;
};

export type PendingRow = {
  id: string;
  name: string | null;
  email: string;
  createdAt: string | null;
  onboarded: boolean;
};

export type AdminOverview = {
  pending: PendingRow[];
  totalClients: number;
  activeClients: number;
  inactiveClients: number;
  trialClients: number;
  canceledClients: number;
  generatedToday: number;
  publishedTotal: number;
  avgPublicationRate: number;       // publicados / entregues (0..1)
  noAccess7d: number;
  neverGenerated: number;
  aiFailures: number;               // erros de IA não resolvidos
  makeFailures: number;             // erros do Make não resolvidos
  lastMakeExecution: string | null;
  lastMakeStatus: string | null;
  delivered: number;
  totalCostUsd: number;
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

/** Início do dia corrente em America/Sao_Paulo, em ISO UTC. */
function startOfTodaySaoPaulo(): string {
  const now = new Date();
  const sp = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const offset = now.getTime() - sp.getTime();
  sp.setHours(0, 0, 0, 0);
  return new Date(sp.getTime() + offset).toISOString();
}

/** Segunda-feira da semana corrente em America/Sao_Paulo, em ISO UTC. */
function startOfWeekSaoPaulo(): string {
  const now = new Date();
  const sp = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const offset = now.getTime() - sp.getTime();
  const day = sp.getDay();
  sp.setDate(sp.getDate() + (day === 0 ? -6 : 1 - day));
  sp.setHours(0, 0, 0, 0);
  return new Date(sp.getTime() + offset).toISOString();
}

/**
 * Agrega as métricas do dashboard administrativo. A RLS delimita o escopo
 * automaticamente: admin vê o próprio tenant, super_admin vê tudo.
 */
export async function getAdminOverview(supabase: SupabaseClient): Promise<AdminOverview> {
  const todayStart = startOfTodaySaoPaulo();
  const weekStart = startOfWeekSaoPaulo();

  const [
    { data: clients },
    { data: items },
    { data: events },
    { data: opps },
    { data: costs },
    deliveries,
    aiErrors,
    makeErrors,
    { data: lastMake },
  ] = await Promise.all([
    supabase
      .from("users")
      .select(
        "id, full_name, email, is_active, onboarded_at, created_at, tenants(status), client_profiles(profession, segment, dna_generated_at), client_preferences(weekly_goal)"
      )
      // Inclui admins/super_admins que também consomem conteúdo (dogfooding).
      .in("role", ["client", "admin", "super_admin"])
      .is("deleted_at", null)
      .limit(1000),
    supabase
      .from("content_items")
      .select("user_id, status, published_at, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase
      .from("behavior_events")
      .select("user_id, created_at")
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase
      .from("daily_opportunities")
      .select("user_id, title, created_at")
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase.from("cost_logs").select("cost_usd").limit(10000),
    supabase.from("deliveries").select("id", { count: "exact", head: true }),
    supabase
      .from("system_errors")
      .select("id", { count: "exact", head: true })
      .eq("scope", "ai")
      .is("resolved_at", null),
    supabase
      .from("system_errors")
      .select("id", { count: "exact", head: true })
      .eq("scope", "make")
      .is("resolved_at", null),
    supabase
      .from("execution_logs")
      .select("created_at, status, operation")
      .eq("source", "make")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const clientList = clients ?? [];
  const itemList = items ?? [];
  const eventList = events ?? [];
  const oppList = opps ?? [];

  // Últimos registros por cliente (as listas já vêm ordenadas desc).
  const lastAccessByUser = new Map<string, string>();
  for (const e of eventList)
    if (!lastAccessByUser.has(e.user_id)) lastAccessByUser.set(e.user_id, e.created_at as string);

  const lastGenByUser = new Map<string, string>();
  const lastPubByUser = new Map<string, string>();
  const publishedByUser = new Map<string, number>();
  const publishedWeekByUser = new Map<string, number>();
  let publishedTotal = 0;
  let generatedToday = 0;
  for (const it of itemList) {
    if (!lastGenByUser.has(it.user_id)) lastGenByUser.set(it.user_id, it.created_at as string);
    if ((it.created_at as string) >= todayStart) generatedToday += 1;
    if (it.status === "published") {
      publishedByUser.set(it.user_id, (publishedByUser.get(it.user_id) ?? 0) + 1);
      publishedTotal += 1;
      const pub = (it.published_at as string) ?? (it.created_at as string);
      if (!lastPubByUser.has(it.user_id) || pub > lastPubByUser.get(it.user_id)!) {
        lastPubByUser.set(it.user_id, pub);
      }
      if (pub >= weekStart) {
        publishedWeekByUser.set(it.user_id, (publishedWeekByUser.get(it.user_id) ?? 0) + 1);
      }
    }
  }

  const lastOppByUser = new Map<string, string>();
  for (const o of oppList)
    if (!lastOppByUser.has(o.user_id)) lastOppByUser.set(o.user_id, o.title as string);

  type JoinedRow = (typeof clientList)[number] & {
    tenants?: { status: string } | { status: string }[] | null;
    client_profiles?: unknown;
    client_preferences?: unknown;
  };
  const one = <T,>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

  const rows: ClientRow[] = clientList.map((c) => {
    const j = c as JoinedRow;
    const tenant = one(j.tenants) as { status?: string } | null;
    const profile = one(j.client_profiles) as
      | { profession?: string | null; segment?: string | null; dna_generated_at?: string | null }
      | null;
    const prefs = one(j.client_preferences) as { weekly_goal?: number } | null;

    const lastAccess = lastAccessByUser.get(c.id) ?? null;
    const days = daysSince(lastAccess);
    const pub = publishedByUser.get(c.id) ?? 0;
    const goal = prefs?.weekly_goal ?? 3;
    const pubWeek = publishedWeekByUser.get(c.id) ?? 0;
    return {
      id: c.id,
      name: c.full_name,
      email: c.email,
      profession: profile?.profession ?? null,
      segment: profile?.segment ?? null,
      plan: tenant?.status ?? "trial",
      isActive: c.is_active,
      onboarded: Boolean(c.onboarded_at),
      hasDna: Boolean(profile?.dna_generated_at),
      weeklyGoal: goal,
      publishedThisWeek: pubWeek,
      weeklyPct: goal > 0 ? Math.min(1, pubWeek / goal) : 0,
      publishedTotal: pub,
      lastAccess,
      lastGeneration: lastGenByUser.get(c.id) ?? null,
      lastPublication: lastPubByUser.get(c.id) ?? null,
      lastOpportunity: lastOppByUser.get(c.id) ?? null,
      daysSinceAccess: days,
      health: healthFor(pub, days),
    };
  });

  const delivered = deliveries.count ?? 0;
  const last = (lastMake ?? [])[0] ?? null;

  // Pendentes de aprovação (is_active = false) ficam à parte; as métricas e a
  // lista principal consideram apenas os clientes já aprovados (ativos).
  const approved = rows.filter((r) => r.isActive);
  const pending: PendingRow[] = clientList
    .filter((c) => c.is_active === false)
    .map((c) => ({
      id: c.id,
      name: c.full_name,
      email: c.email,
      createdAt: (c.created_at as string) ?? null,
      onboarded: Boolean(c.onboarded_at),
    }))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  return {
    pending,
    totalClients: approved.length,
    activeClients: approved.length,
    inactiveClients: pending.length,
    trialClients: approved.filter((r) => r.plan === "trial").length,
    canceledClients: approved.filter((r) => r.plan === "canceled").length,
    generatedToday,
    publishedTotal,
    avgPublicationRate: delivered > 0 ? publishedTotal / delivered : 0,
    noAccess7d: approved.filter((r) => r.daysSinceAccess == null || r.daysSinceAccess > 7).length,
    neverGenerated: approved.filter((r) => !lastGenByUser.has(r.id)).length,
    aiFailures: aiErrors.count ?? 0,
    makeFailures: makeErrors.count ?? 0,
    lastMakeExecution: last?.created_at ?? null,
    lastMakeStatus: last?.status ?? null,
    delivered,
    totalCostUsd: (costs ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0),
    clients: approved.sort((a, b) => {
      const order = { risk: 0, attention: 1, healthy: 2 };
      return order[a.health] - order[b.health];
    }),
  };
}
