import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeProgress } from "@/lib/progress/compute";

export type WeeklyReport = {
  week_start: string;
  opportunities: number;
  read_count: number;
  produced_count: number;
  videos_recorded: number;
  posts_created: number;
  published_count: number;
  execution_rate: number | null;
  achievement: string | null;
  attention_point: string | null;
  recommendation: string | null;
  next_week_goal: number | null;
  narrative: string | null;
};

function mondayIso(offsetWeeks = 0): string {
  const d = new Date();
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day + offsetWeeks * 7;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Constrói o texto do relatório na voz da marca (sem culpa). */
function buildNarrative(name: string | null, p: Awaited<ReturnType<typeof computeProgress>>, videos: number): string {
  const who = name ? name.split(" ")[0] : "Você";
  const growth =
    p.deltaVsPrev > 0
      ? `Sua presença cresceu ${p.deltaVsPrev}% em relação à semana anterior.`
      : p.publishedCount > 0
        ? "Você manteve sua presença viva nesta semana."
        : "Nesta semana o radar seguiu trabalhando por você.";
  const best = p.publishedCount > 0 && p.publishedCount >= p.publishedPrev && p.currentStreak >= 2;
  const opener = best ? `${who}, esta foi uma das suas melhores semanas.` : `${who}, aqui está sua semana.`;
  return `${opener} Você recebeu ${p.deliveredCount} oportunidades, produziu ${p.producedCount} conteúdos${
    videos > 0 ? `, gravou ${videos} vídeo${videos > 1 ? "s" : ""}` : ""
  } e publicou ${p.publishedCount}. ${growth}`;
}

/**
 * Gera (ou regenera) o relatório da semana atual para o usuário e persiste em
 * weekly_reports. Idempotente por (user_id, week_start).
 */
export async function generateWeeklyReport(
  supabase: SupabaseClient,
  user: { id: string; tenant_id: string | null; full_name: string | null }
): Promise<WeeklyReport> {
  const p = await computeProgress(supabase, user.id);
  const weekStart = mondayIso();
  const weekStartIso = weekStart + "T00:00:00Z";

  const [videos, posts] = await Promise.all([
    supabase
      .from("behavior_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("event_type", "gravacao_concluida")
      .gte("created_at", weekStartIso),
    supabase
      .from("content_formats")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .neq("format", "video")
      .gte("created_at", weekStartIso),
  ]);

  const videosRecorded = videos.count ?? 0;
  const postsCreated = posts.count ?? 0;

  const achievement =
    p.publishedCount > 0
      ? `${p.publishedCount} publicado${p.publishedCount > 1 ? "s" : ""} — sequência de ${p.currentStreak} semana${p.currentStreak > 1 ? "s" : ""}.`
      : null;
  const attention =
    p.publishedCount < p.target ? "Ainda dá tempo de fechar a meta com um formato mais leve." : null;
  const recommendation =
    p.preferredFormat && p.publishedCount < p.target
      ? `Seu formato mais forte é ${p.preferredFormat}. Comece por ele nesta semana.`
      : "Mantenha o ritmo — consistência é o que constrói autoridade.";

  const report: WeeklyReport = {
    week_start: weekStart,
    opportunities: p.deliveredCount,
    read_count: p.readCount,
    produced_count: p.producedCount,
    videos_recorded: videosRecorded,
    posts_created: postsCreated,
    published_count: p.publishedCount,
    execution_rate: p.executionRate,
    achievement,
    attention_point: attention,
    recommendation,
    next_week_goal: p.target,
    narrative: buildNarrative(user.full_name, p, videosRecorded),
  };

  await supabase.from("weekly_reports").upsert(
    { tenant_id: user.tenant_id, user_id: user.id, ...report },
    { onConflict: "user_id,week_start" }
  );

  return report;
}
