import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generate } from "@/lib/ai";

/**
 * DNA EDITORIAL POLÍTICO — o documento que o Assessor 24h carrega em toda
 * resposta de WhatsApp e em toda pauta do vereador. É um superconjunto do DNA
 * genérico (mesmas chaves `pilares`, `tom`, `assuntos_proibidos`,
 * `angulo_unico`), então tudo que já consome o DNA continua funcionando —
 * com os campos de mandato somados por cima.
 */
export const politicalDnaSchema = z.object({
  identidade: z.string(),
  mandato: z.string(),
  publico: z.string(),
  pilares: z.array(z.string()).min(3).max(8),
  tom: z.string(),
  estilo_verbal: z.string(),
  valores: z.string(),
  assuntos_proibidos: z.array(z.string()),
  adversarios_nao_citar: z.array(z.string()),
  relacao_com_prefeito: z.string(),
  temas_locais: z.array(z.string()),
  fontes_prioritarias: z.array(z.string()),
  referencias: z.string(),
  estilo_editorial: z.string(),
  formatos_preferidos: z.array(z.string()),
  angulo_unico: z.string(),
  frases_modelo: z.array(z.string()).max(6),
});
export type PoliticalDna = z.infer<typeof politicalDnaSchema>;

const DNA_JSON_SCHEMA: Record<string, unknown> = {
  identidade:
    "quem é o parlamentar: nome de urna, cidade/UF, partido, mandato, cargos e trajetória, em um parágrafo",
  mandato: "o que este mandato defende na prática: bandeiras, entregas e base eleitoral",
  publico: "quem ele fala com: perfil do eleitorado, bairros e grupos, dores concretas",
  pilares: ["3 a 8 bandeiras/pilares editoriais deste mandato, específicos desta cidade"],
  tom: "tom de comunicação combinando as escolhas da anamnese",
  estilo_verbal:
    "como ele fala de verdade: gírias e expressões próprias, uso de emojis, como deve ser chamado e o bordão — instruções práticas de escrita",
  valores: "valores inegociáveis do mandato",
  assuntos_proibidos: ["temas que NUNCA devem aparecer"],
  adversarios_nao_citar: ["nomes que não devem ser citados em nenhuma hipótese"],
  relacao_com_prefeito:
    "como tratar o Executivo municipal (situação, oposição ou independente) e onde está o limite da crítica",
  temas_locais: ["pautas quentes da cidade que este mandato deve ocupar"],
  fontes_prioritarias: ["fontes e imprensa local a consultar, na ordem"],
  referencias: "síntese do estilo de quem inspira a comunicação dele — para compreender, nunca copiar",
  estilo_editorial: "como o conteúdo deste mandato deve soar e se estruturar, na prática",
  formatos_preferidos: ["formatos preferidos"],
  angulo_unico:
    "o recorte que diferencia este vereador de qualquer outro parlamentar da mesma cidade",
  frases_modelo: ["até 6 frases curtas na voz dele, que servem de calibragem para a IA"],
};

const DNA_SYSTEM = `Você é o Chefe de Comunicação do "Assessor 24h", que atende mandatos municipais.
A partir da anamnese completa de um vereador, você redige o DNA EDITORIAL dele: o documento
que orientará TODA a comunicação daquele mandato — respostas no WhatsApp, pautas e conteúdos.
Regras:
- Escreva sobre ESTE mandato, nesta cidade, com as palavras dele — nada genérico.
- estilo_verbal e frases_modelo precisam soar como a pessoa fala: use as gírias, o bordão e os
  emojis informados. Se ele não usa emoji, diga isso explicitamente.
- Limites são absolutos: assuntos_proibidos, adversarios_nao_citar e o histórico a evitar nunca
  podem aparecer no conteúdo, nem por insinuação.
- angulo_unico é o campo mais importante: o recorte que diferencia este vereador de qualquer
  outro parlamentar da mesma cidade.
- Não invente feitos, números, obras ou cargos que não estejam na anamnese.
- Português do Brasil. Responda somente com o JSON pedido.`;

/**
 * Gera o DNA Editorial político a partir do contexto_mestre e persiste no
 * perfil. Depois reconstrói o contexto para embutir o DNA recém-gerado.
 */
export async function generatePoliticalDna(
  supabase: SupabaseClient,
  input: { tenantId: string; userId: string }
): Promise<PoliticalDna> {
  const { data: ctx } = await supabase.rpc("build_contexto_mestre", { p_user_id: input.userId });

  const dna = await generate<PoliticalDna>({
    scenario: "generation",
    system: DNA_SYSTEM,
    prompt: [
      "ANAMNESE COMPLETA DO MANDATO:",
      JSON.stringify(ctx ?? {}, null, 2),
      "",
      "Gere o DNA EDITORIAL deste vereador.",
    ].join("\n"),
    schema: politicalDnaSchema,
    jsonSchema: DNA_JSON_SCHEMA,
    maxTokens: 3500,
    cost: { tenantId: input.tenantId, userId: input.userId },
  });

  // `tipo` marca a origem do documento para quem consome o DNA (app e Make).
  await supabase
    .from("client_profiles")
    .update({
      editorial_dna: { tipo: "politico", ...dna },
      dna_generated_at: new Date().toISOString(),
    })
    .eq("user_id", input.userId);

  const { data: ctx2 } = await supabase.rpc("build_contexto_mestre", { p_user_id: input.userId });
  await supabase
    .from("client_profiles")
    .update({ contexto_mestre: ctx2 ?? {} })
    .eq("user_id", input.userId);

  return dna;
}
