import type { z } from "zod";

/** Cenários de uso da IA (alinhados ao enum ai_scenario do banco). */
export type AiScenario = "classification" | "generation" | "adjustment" | "report" | "decision";

export type AiProviderName = "anthropic" | "openai";

export type AiUsage = {
  provider: AiProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

export type AiResult<T> = {
  data: T;
  usage: AiUsage;
};

/**
 * Requisição estruturada: um schema Zod + JSON Schema descreve a saída esperada.
 * A camada valida a resposta com o schema antes de retornar.
 */
export type StructuredRequest<T> = {
  scenario: AiScenario;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  /** JSON Schema equivalente ao schema Zod (para output estruturado do provedor). */
  jsonSchema: Record<string, unknown>;
  /** Sobrepõe o modelo padrão do cenário, quando necessário. */
  model?: string;
  maxTokens?: number;
};

/** Contrato que todo provedor de IA deve implementar. */
export interface AiProvider {
  readonly name: AiProviderName;
  generateStructured<T>(req: StructuredRequest<T>): Promise<AiResult<T>>;
}
