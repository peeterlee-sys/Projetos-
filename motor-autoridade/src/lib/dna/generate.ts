import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generate } from "@/lib/ai";

/**
 * DNA EDITORIAL — documento estruturado gerado ao fim da anamnese e usado em
 * TODAS as gerações de IA do cliente (pauta, roteiro, carrossel, post, story,
 * LinkedIn). É o que garante que dois clientes do mesmo segmento nunca
 * recebam a mesma abordagem.
 */
export const dnaSchema = z.object({
  identidade: z.string(),
  objetivos: z.string(),
  publico: z.string(),
  pilares: z.array(z.string()).min(3).max(8),
  tom: z.string(),
  valores: z.string(),
  assuntos_proibidos: z.array(z.string()),
  fontes_prioritarias: z.array(z.string()),
  referencias: z.string(),
  estilo_editorial: z.string(),
  formatos_preferidos: z.array(z.string()),
  angulo_unico: z.string(),
});
export type EditorialDna = z.infer<typeof dnaSchema>;

const DNA_JSON_SCHEMA: Record<string, unknown> = {
  identidade: "quem é o cliente: nome, profissão, especialidade, cidade, experiência, história e diferenciais em um parágrafo",
  objetivos: "por que produz conteúdo e o que quer alcançar",
  publico: "quem quer atingir: idade, cidade, classe, profissão, dores, dúvidas e objeções",
  pilares: ["3 a 8 pilares editoriais (assuntos que ele quer dominar), específicos deste cliente"],
  tom: "tom de comunicação combinando as escolhas da anamnese",
  valores: "valores inegociáveis",
  assuntos_proibidos: ["assuntos que NUNCA devem aparecer"],
  fontes_prioritarias: ["fontes que o cliente prioriza, na ordem"],
  referencias: "síntese do estilo das pessoas que o inspiram (estrutura, profundidade, linguagem) — para compreender, nunca copiar",
  estilo_editorial: "como o conteúdo deste cliente deve soar e se estruturar, na prática",
  formatos_preferidos: ["formatos preferidos"],
  angulo_unico: "o ângulo próprio deste cliente: o recorte que diferencia o conteúdo dele de qualquer outro profissional do mesmo segmento",
};

const DNA_SYSTEM = `Você é o Editor-Chefe do "Take".
A partir da anamnese editorial completa de um cliente, você redige o DNA EDITORIAL dele:
o documento que orientará TODA a produção de conteúdo daquele cliente.
Regras:
- Escreva sobre ESTE cliente, com as palavras dele — nada genérico.
- O campo angulo_unico é o mais importante: capture o recorte que torna este cliente
  diferente de qualquer outro profissional do mesmo segmento.
- Sobre as referências de inspiração: descreva estilo, estrutura, profundidade, tom,
  linguagem e frequência. Compreender o estilo — nunca copiar conteúdo.
- Português do Brasil. Responda somente com o JSON pedido.`;

/**
 * Gera o DNA Editorial a partir do contexto_mestre e persiste no perfil.
 * Depois reconstrói o contexto_mestre para embutir o DNA recém-gerado.
 */
export async function generateEditorialDna(
  supabase: SupabaseClient,
  input: { tenantId: string; userId: string }
): Promise<EditorialDna> {
  const { data: ctx } = await supabase.rpc("build_contexto_mestre", { p_user_id: input.userId });

  const dna = await generate<EditorialDna>({
    scenario: "generation",
    system: DNA_SYSTEM,
    prompt: [
      "ANAMNESE EDITORIAL COMPLETA DO CLIENTE:",
      JSON.stringify(ctx ?? {}, null, 2),
      "",
      "Gere o DNA EDITORIAL deste cliente.",
    ].join("\n"),
    schema: dnaSchema,
    jsonSchema: DNA_JSON_SCHEMA,
    maxTokens: 3000,
    cost: { tenantId: input.tenantId, userId: input.userId },
  });

  await supabase
    .from("client_profiles")
    .update({ editorial_dna: dna, dna_generated_at: new Date().toISOString() })
    .eq("user_id", input.userId);

  // Reconstrói o contexto com o DNA embutido (a função do banco o inclui).
  const { data: ctx2 } = await supabase.rpc("build_contexto_mestre", { p_user_id: input.userId });
  await supabase
    .from("client_profiles")
    .update({ contexto_mestre: ctx2 ?? {} })
    .eq("user_id", input.userId);

  return dna;
}
