import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pickStimulus, type StimulusSignals } from "./stimulus";

function mondayIso(): string {
  const d = new Date();
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10) + "T00:00:00Z";
}

/** Coleta sinais do cliente e devolve o estímulo do dia (MÓDULO 8). */
export async function getStimulus(
  supabase: SupabaseClient,
  userId: string,
  weeklyGoal: number,
  hasOpportunityToday: boolean
): Promise<{ message: string }> {
  const weekStart = mondayIso();

  const [published, recorded, inProduction, lastEvent] = await Promise.all([
    supabase
      .from("content_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "published")
      .gte("published_at", weekStart),
    supabase
      .from("content_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "recorded"),
    supabase
      .from("content_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "in_production"),
    supabase
      .from("behavior_events")
      .select("created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  let daysSince: number | null = null;
  if (lastEvent.data?.created_at) {
    const diffMs = Date.now() - new Date(lastEvent.data.created_at as string).getTime();
    daysSince = Math.floor(diffMs / 86_400_000);
  }

  const signals: StimulusSignals = {
    publishedThisWeek: published.count ?? 0,
    weeklyGoal,
    hasOpportunityToday,
    recordedNotPublished: (recorded.count ?? 0) > 0,
    openedNotProduced: (inProduction.count ?? 0) > 0,
    daysSinceLastActivity: daysSince,
  };

  return { message: pickStimulus(signals).message };
}
