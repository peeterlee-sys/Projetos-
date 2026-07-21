import type { AiUsage } from "./types";

/**
 * Preços por 1M de tokens (USD). Fonte: tabela de modelos da Anthropic/OpenAI.
 * Ajuste conforme necessário; usado apenas para estimativa em cost_logs.
 */
const PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  // OpenAI (aproximado)
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1": { input: 2, output: 8 },
};

/** Custo estimado em USD para um uso de IA. */
export function estimateCostUsd(usage: AiUsage): number {
  const p = PRICING[usage.model];
  if (!p) return 0;
  return (usage.inputTokens / 1_000_000) * p.input + (usage.outputTokens / 1_000_000) * p.output;
}
