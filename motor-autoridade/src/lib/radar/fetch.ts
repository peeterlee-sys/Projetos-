import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { domainOf, normalize, parseGoogleNewsRss, type RadarHeadline } from "./parse";

/**
 * Radar de notícias REAIS. Para cada cliente, busca manchetes atuais a partir
 * dos pilares do DNA + fontes priorizadas, usando o RSS de busca do Google
 * News (pt-BR). É o que permite entregar "assunto do dia traduzido para a
 * linguagem do cliente" — cada cliente puxa das SUAS fontes/temas.
 */

export type { RadarHeadline };

const GOOGLE_NEWS = "https://news.google.com/rss/search";
const LOCALE = "hl=pt-BR&gl=BR&ceid=BR:pt-419";
const FETCH_TIMEOUT_MS = 7000;
const MAX_HEADLINES = 12;
const FRESH_DAYS = 4;

async function fetchFeed(query: string): Promise<RadarHeadline[]> {
  const url = `${GOOGLE_NEWS}?q=${encodeURIComponent(query)}&${LOCALE}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "TakeRadar/1.0 (+https://take.app)" },
    });
    if (!res.ok) return [];
    return parseGoogleNewsRss(await res.text());
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Monta a consulta de temas: pilares/temas do cliente com OR. */
function themeQuery(themes: string[], fallback: string): string {
  const top = themes.filter(Boolean).slice(0, 5);
  if (top.length === 0) return fallback;
  return top.map((t) => `"${t}"`).join(" OR ");
}

export async function fetchRadar(
  supabase: SupabaseClient,
  userId: string
): Promise<{ headlines: RadarHeadline[]; headlines_text: string; queries: string[] }> {
  const [{ data: profile }, { data: sources }] = await Promise.all([
    supabase
      .from("client_profiles")
      .select("main_themes, forbidden_themes, profession, field_of_work, segment")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("influence_sources")
      .select("url, priority, is_blocked")
      .eq("user_id", userId)
      .eq("is_blocked", false)
      .limit(50),
  ]);

  const themes = (profile?.main_themes ?? []) as string[];
  const forbidden = ((profile?.forbidden_themes ?? []) as string[]).map(normalize).filter(Boolean);
  const fallback =
    [profile?.profession, profile?.field_of_work, profile?.segment].filter(Boolean).join(" ") ||
    "notícias";

  // Domínios das fontes prioritárias do cliente (para dar preferência).
  const priorityDomains = new Set(
    ((sources ?? []) as { url: string | null; priority: string }[])
      .map((s) => domainOf(s.url))
      .filter((d): d is string => Boolean(d))
  );

  const base = themeQuery(themes, fallback);
  const queries: string[] = [base, `${fallback} when:${FRESH_DAYS}d`];
  // Consulta específica das 2 fontes prioritárias com domínio jornalístico.
  for (const d of [...priorityDomains].slice(0, 2)) {
    queries.push(`${base} site:${d}`);
  }

  const results = await Promise.all(queries.map(fetchFeed));
  const flat = results.flat();

  // Dedupe por título normalizado; marca origem prioritária; filtra proibidos/antigos.
  const cutoff = Date.now() - FRESH_DAYS * 86_400_000;
  const seen = new Set<string>();
  const headlines: RadarHeadline[] = [];
  for (const h of flat) {
    const key = normalize(h.title);
    if (!key || seen.has(key)) continue;
    if (h.published_at && new Date(h.published_at).getTime() < cutoff) continue;
    if (forbidden.some((f) => f && key.includes(f))) continue;
    seen.add(key);
    const dom = domainOf(h.url);
    headlines.push({ ...h, from_priority_source: dom ? priorityDomains.has(dom) : false });
  }

  headlines.sort((a, b) => {
    if (a.from_priority_source !== b.from_priority_source) return a.from_priority_source ? -1 : 1;
    const ta = a.published_at ? new Date(a.published_at).getTime() : 0;
    const tb = b.published_at ? new Date(b.published_at).getTime() : 0;
    return tb - ta;
  });

  const top = headlines.slice(0, MAX_HEADLINES);
  const headlines_text = top
    .map((h, i) => {
      const date = h.published_at ? h.published_at.slice(0, 10) : "s/data";
      const star = h.from_priority_source ? " [fonte prioritária]" : "";
      return `${i + 1}. "${h.title}" — ${h.source} · ${date}${star} · ${h.url}`;
    })
    .join("\n");

  return { headlines: top, headlines_text, queries };
}
