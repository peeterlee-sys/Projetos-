import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ProgressData = {
  weekStart: string;
  target: number;
  deliveredCount: number;
  readCount: number;
  producedCount: number;
  publishedCount: number;
  publishedPrev: number;
  executionRate: number; // publicados / entregues (0..1)
  currentStreak: number; // semanas consecutivas com ≥1 publicação
  bestStreak: number;
  preferredFormat: string | null;
  preferredFormatPct: number | null; // participação % do formato mais usado
  deltaVsPrev: number; // variação % de publicações vs semana anterior
  publishedMonth: number; // publicados no mês corrente
  /** Últimas 6 semanas (da mais antiga à atual) para o gráfico de evolução. */
  weeklySeries: { label: string; count: number; current: boolean }[];
};

const MONTH_ABBR = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

/** Segunda-feira da semana de uma data (UTC), em ISO yyyy-mm-dd. */
function mondayOf(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay(); // 0=domingo
  const diff = (day === 0 ? -6 : 1) - day;
  x.setUTCDate(x.getUTCDate() + diff);
  return x.toISOString().slice(0, 10);
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Calcula o progresso do cliente a partir de dados reais (content_items,
 * deliveries, behavior_events, preferências). Métrica principal = publicado.
 */
export async function computeProgress(
  supabase: SupabaseClient,
  userId: string
): Promise<ProgressData> {
  const now = new Date();
  const weekStart = mondayOf(now);
  const prevStart = addDaysISO(weekStart, -7);
  const weekStartIso = weekStart + "T00:00:00Z";
  const prevStartIso = prevStart + "T00:00:00Z";

  const [prefs, published, publishedList, delivered, opened, produced, formats] = await Promise.all([
    supabase.from("client_preferences").select("weekly_goal").eq("user_id", userId).maybeSingle(),
    supabase
      .from("content_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "published")
      .gte("published_at", weekStartIso),
    // Publicações (com data) para calcular sequências por semana.
    supabase
      .from("content_items")
      .select("published_at")
      .eq("user_id", userId)
      .eq("status", "published")
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })
      .limit(400),
    supabase
      .from("deliveries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("delivered_at", weekStartIso),
    supabase
      .from("behavior_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("event_type", "conteudo_aberto")
      .gte("created_at", weekStartIso),
    supabase
      .from("content_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", weekStartIso),
    supabase.from("content_formats").select("format").eq("user_id", userId).limit(500),
  ]);

  const publishedCount = published.count ?? 0;

  // Publicados na semana anterior.
  const prevPublished = (publishedList.data ?? []).filter((r) => {
    const p = r.published_at as string;
    return p >= prevStartIso && p < weekStartIso;
  }).length;

  // Sequências por semana (semanas ISO com ≥1 publicação).
  const weeks = new Set<string>();
  for (const r of publishedList.data ?? []) {
    weeks.add(mondayOf(new Date(r.published_at as string)));
  }
  const { current, best } = weekStreaks(weeks, weekStart);

  // Formato preferido.
  const counts = new Map<string, number>();
  for (const f of formats.data ?? []) counts.set(f.format, (counts.get(f.format) ?? 0) + 1);
  let preferredFormat: string | null = null;
  let max = 0;
  for (const [k, v] of counts) {
    if (v > max) {
      max = v;
      preferredFormat = k;
    }
  }

  // Série das últimas 6 semanas para o gráfico "Evolução".
  const weekCounts = new Map<string, number>();
  for (const r of publishedList.data ?? []) {
    const w = mondayOf(new Date(r.published_at as string));
    weekCounts.set(w, (weekCounts.get(w) ?? 0) + 1);
  }
  const weeklySeries: { label: string; count: number; current: boolean }[] = [];
  let prevMonth = -1;
  for (let i = 5; i >= 0; i--) {
    const w = addDaysISO(weekStart, -7 * i);
    const d = new Date(w + "T00:00:00Z");
    const isCurrent = i === 0;
    const month = d.getUTCMonth();
    const label = isCurrent
      ? "atual"
      : month !== prevMonth
        ? `${d.getUTCDate()} ${MONTH_ABBR[month]}`
        : String(d.getUTCDate());
    prevMonth = month;
    weeklySeries.push({ label, count: weekCounts.get(w) ?? 0, current: isCurrent });
  }

  // Publicados no mês corrente.
  const monthStartIso =
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const publishedMonth = (publishedList.data ?? []).filter(
    (r) => (r.published_at as string) >= monthStartIso
  ).length;

  const totalFormats = (formats.data ?? []).length;
  const preferredFormatPct =
    preferredFormat && totalFormats > 0 ? Math.round((max / totalFormats) * 100) : null;

  const deliveredCount = delivered.count ?? 0;
  const executionRate = deliveredCount > 0 ? publishedCount / deliveredCount : 0;
  const deltaVsPrev =
    prevPublished > 0
      ? Math.round(((publishedCount - prevPublished) / prevPublished) * 100)
      : publishedCount > 0
        ? 100
        : 0;

  return {
    weekStart,
    target: prefs.data?.weekly_goal ?? 3,
    deliveredCount,
    readCount: opened.count ?? 0,
    producedCount: produced.count ?? 0,
    publishedCount,
    publishedPrev: prevPublished,
    executionRate,
    currentStreak: current,
    bestStreak: best,
    preferredFormat,
    preferredFormatPct,
    deltaVsPrev,
    publishedMonth,
    weeklySeries,
  };
}

/** Sequência atual e melhor sequência de semanas consecutivas com publicação. */
function weekStreaks(weeks: Set<string>, thisWeek: string): { current: number; best: number } {
  if (weeks.size === 0) return { current: 0, best: 0 };
  const sorted = [...weeks].sort(); // asc
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === addDaysISO(sorted[i - 1], 7)) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }
  // Sequência atual: conta para trás a partir desta semana (ou da anterior).
  let cursor = weeks.has(thisWeek) ? thisWeek : addDaysISO(thisWeek, -7);
  let current = 0;
  while (weeks.has(cursor)) {
    current += 1;
    cursor = addDaysISO(cursor, -7);
  }
  return { current, best };
}
