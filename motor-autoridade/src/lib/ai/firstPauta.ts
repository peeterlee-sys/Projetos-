import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateWithWebSearch } from "./webResearch";

const schema = z.object({
  title: z.string(),
  theme: z.string(),
  reason: z.string(),
  editorial_angle: z.string(),
  recommended_format: z.enum(["video", "carousel", "post", "story", "linkedin"]),
  estimated_duration: z.number().int(),
  sources: z
    .array(z.object({ title: z.string(), source: z.string().optional(), url: z.string().optional() }))
    .optional(),
});

const JSON_SCHEMA = {
  title: "título editorial que fisga e ancora na notícia",
  theme: "TAG curta de 2-4 palavras (nunca uma frase)",
  reason: "cita a notícia/veículo e por que é quente AGORA",
  editorial_angle: "o recorte único do cliente para a audiência dele (1-2 frases)",
  recommended_format: "video | carousel | post | story | linkedin",
  estimated_duration: "número inteiro em segundos",
  sources: [{ title: "manchete", source: "veículo", url: "link" }],
};

const SYSTEM = `Você é o EDITOR-CHEFE PESSOAL do cliente no Take. Sua missão: entregar a
PRIMEIRA pauta do cliente, partindo de uma NOTÍCIA REAL E ATUAL (de hoje ou desta semana)
relevante à área dele, com o ângulo EXCLUSIVO do cliente para o PÚBLICO dele — a leitura
que poucos fazem. Nunca aconselhe os personagens da notícia; sirva à audiência do cliente.
Respeite o tom, os temas e os assuntos proibidos do DNA. Português do Brasil.`;

/**
 * Gera a primeira pauta do cliente logo após a anamnese, para ele não cair num
 * radar vazio. Best-effort: qualquer falha é silenciosa (o radar das 7h cobre).
 * Não duplica se já houver pauta para hoje.
 */
export async function generateFirstPauta(
  supabase: SupabaseClient,
  { tenantId, userId }: { tenantId: string; userId: string }
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  const { data: existing } = await supabase
    .from("daily_opportunities")
    .select("id")
    .eq("user_id", userId)
    .eq("opportunity_date", today)
    .limit(1)
    .maybeSingle();
  if (existing) return;

  const { data: profile } = await supabase
    .from("client_profiles")
    .select("contexto_mestre, main_themes, segment, tone_of_voice, forbidden_themes")
    .eq("user_id", userId)
    .maybeSingle();

  const payload = await generateWithWebSearch({
    system: SYSTEM,
    prompt: [
      `DNA E CONTEXTO EDITORIAL DO CLIENTE:`,
      JSON.stringify(profile?.contexto_mestre ?? {}, null, 2),
      ``,
      `Temas/pilares: ${((profile?.main_themes ?? []) as string[]).join(", ") || "—"}`,
      `Segmento: ${profile?.segment ?? "—"}`,
      `Evitar: ${((profile?.forbidden_themes ?? []) as string[]).join(", ") || "—"}`,
      ``,
      `Pesquise a notícia mais quente e relevante para ESTE cliente agora e monte`,
      `a primeira pauta dele. Responda SOMENTE com JSON no formato:`,
      JSON.stringify(JSON_SCHEMA),
    ].join("\n"),
    schema,
    maxSearches: 4,
  });

  await supabase.from("daily_opportunities").insert({
    tenant_id: tenantId,
    user_id: userId,
    title: payload.title,
    theme: payload.theme,
    reason: payload.reason,
    editorial_angle: payload.editorial_angle,
    recommended_format: payload.recommended_format,
    estimated_duration: payload.estimated_duration,
    relevance_score: 0.9,
    sources: payload.sources ?? [],
    status: "delivered",
  });
}
