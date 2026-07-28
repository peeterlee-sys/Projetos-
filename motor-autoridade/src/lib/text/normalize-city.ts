import "server-only";
import { z } from "zod";
import { generate } from "@/lib/ai";

const citySchema = z.object({ city: z.string().min(1), state: z.string().length(2) });

const SYSTEM = `Você corrige o nome de cidades brasileiras para a grafia oficial do IBGE.

Regras:
- Corrija acentuação, capitalização (ex.: "balneário camboriú" -> "Balneário Camboriú") e abreviações comuns (ex.: "bal camboriu", "bal. camboriu" -> "Balneário Camboriú").
- A UF deve virar a sigla de 2 letras maiúsculas (ex.: "sc" -> "SC").
- Se não reconhecer a cidade com confiança junto dessa UF, devolva exatamente o texto original recebido — nunca invente ou troque por outra cidade.`;

/**
 * Normaliza cidade/UF digitados na anamnese pra grafia oficial (maiúsculas,
 * acentos, sem abreviação) — evita que erro de digitação do vereador apareça
 * "cru" nos textos gerados e quebre a busca do contexto da cidade no admin
 * (que casa por nome). Best-effort: se a IA falhar, mantém o texto original.
 */
export async function normalizeCityState(
  cityRaw: string,
  stateRaw: string,
  cost?: { tenantId?: string | null; userId?: string | null }
): Promise<{ city: string; state: string }> {
  const city = cityRaw.trim();
  const state = stateRaw.trim().toUpperCase();
  if (!city) return { city, state };

  try {
    return await generate({
      scenario: "classification",
      system: SYSTEM,
      prompt: `Cidade: ${city}\nUF: ${state}`,
      schema: citySchema,
      jsonSchema: { city: "grafia oficial da cidade", state: "sigla da UF, 2 letras maiúsculas" },
      maxTokens: 200,
      cost,
    });
  } catch {
    return { city, state };
  }
}
