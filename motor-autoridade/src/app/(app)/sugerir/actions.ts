"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { generate } from "@/lib/ai";
import { generateWithWebSearch } from "@/lib/ai/webResearch";

export type SuggestResult = { ok: false; error: string } | { ok: true; oppId: string };

const suggestionSchema = z.object({
  title: z.string(),
  theme: z.string(),
  reason: z.string(),
  editorial_angle: z.string(),
  recommended_format: z.enum(["video", "carousel", "post", "story", "linkedin"]),
  estimated_duration: z.number().int(),
});

const JSON_SCHEMA = {
  title: "título editorial curto e forte",
  theme: "tema/categoria (2-4 palavras)",
  reason: "por que vale a pena falar disso agora (1 frase)",
  editorial_angle: "o ângulo pessoal do cliente sobre o tema (1-2 frases)",
  recommended_format: "um de: video | carousel | post | story | linkedin",
  estimated_duration: "número inteiro em segundos (ex: 60)",
};

const SYSTEM = `Você é o radar editorial do "Motor de Autoridade". Recebe um tema que o
próprio cliente sugeriu e o transforma em uma oportunidade de pauta bem posicionada,
SEMPRE respeitando o tom de voz, os temas e o público do contexto do cliente, e nunca
os temas proibidos. Fale na primeira pessoa do cliente. Português do Brasil.`;

/**
 * Transforma um tema livre sugerido pelo cliente numa oportunidade de pauta
 * (via IA) e a insere no radar de hoje. Retorna o id para seguir o fluxo.
 */
export async function suggestTopic(idea: string): Promise<SuggestResult> {
  const clean = idea.trim();
  if (clean.length < 3) return { ok: false, error: "Descreva um pouco mais o tema." };
  if (clean.length > 500) return { ok: false, error: "Tema muito longo — resuma a ideia." };

  const user = await requireUser();
  if (!user.tenant_id) return { ok: false, error: "Complete seu onboarding primeiro." };
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("client_profiles")
    .select("contexto_mestre")
    .eq("user_id", user.id)
    .maybeSingle();

  const prompt = [
    `CONTEXTO DO CLIENTE (contexto_mestre):`,
    JSON.stringify(profile?.contexto_mestre ?? {}, null, 2),
    ``,
    `TEMA SUGERIDO PELO CLIENTE: "${clean}"`,
    ``,
    `Pesquise o que está acontecendo AGORA sobre esse tema (últimos dias/semanas)`,
    `e transforme numa oportunidade de pauta pronta para produção, com a cara do`,
    `cliente, ancorada em fatos atuais. Recomende o formato que melhor serve.`,
    ``,
    `Responda no formato JSON:`,
    JSON.stringify(JSON_SCHEMA),
  ].join("\n");

  let payload: z.infer<typeof suggestionSchema>;
  try {
    // 1ª tentativa: com busca na web (fatos atuais).
    payload = await generateWithWebSearch({
      system: SYSTEM,
      prompt,
      schema: suggestionSchema,
      maxSearches: 4,
    });
  } catch {
    // Fallback: geração normal (sem web) — nunca deixa o cliente na mão.
    try {
      payload = await generate({
        scenario: "generation",
        system: SYSTEM,
        prompt,
        schema: suggestionSchema,
        jsonSchema: JSON_SCHEMA,
        cost: { tenantId: user.tenant_id, userId: user.id },
      });
    } catch {
      return { ok: false, error: "A IA não conseguiu montar a pauta agora. Tente de novo." };
    }
  }

  const { data: opp, error } = await supabase
    .from("daily_opportunities")
    .insert({
      tenant_id: user.tenant_id,
      user_id: user.id,
      title: payload.title,
      theme: payload.theme,
      reason: payload.reason,
      editorial_angle: payload.editorial_angle,
      recommended_format: payload.recommended_format,
      estimated_duration: payload.estimated_duration,
      relevance_score: 0.85,
      status: "delivered",
    })
    .select("id")
    .single();

  if (error || !opp) return { ok: false, error: "Não foi possível salvar a pauta." };

  return { ok: true, oppId: opp.id };
}

/** Wrapper para <form action>: cria a pauta e redireciona à escolha de formato. */
export async function suggestTopicForm(formData: FormData): Promise<void> {
  const res = await suggestTopic(String(formData.get("idea") ?? ""));
  if (res.ok) redirect(`/oportunidade/${res.oppId}`);
  redirect(`/sugerir?erro=${encodeURIComponent(res.error)}`);
}
