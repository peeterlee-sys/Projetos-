import "server-only";
import type { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { AnthropicProvider } from "./anthropic";
import { OpenAIProvider } from "./openai";
import { estimateCostUsd } from "./cost";
import type { AiProvider, AiProviderName, AiResult, AiScenario, StructuredRequest } from "./types";

export type { AiScenario } from "./types";

function pickProvider(name?: AiProviderName): AiProvider {
  const chosen = name ?? (process.env.AI_DEFAULT_PROVIDER as AiProviderName) ?? "anthropic";
  return chosen === "openai" ? new OpenAIProvider() : new AnthropicProvider();
}

export type GenerateOptions<T> = {
  scenario: AiScenario;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  jsonSchema: Record<string, unknown>;
  provider?: AiProviderName;
  model?: string;
  maxTokens?: number;
  /** Contexto para o registro de custos. */
  cost?: { tenantId?: string | null; userId?: string | null; contentId?: string | null };
  retries?: number;
};

/**
 * Gera saída estruturada validada por schema, com retries controlados e
 * registro de custo/tokens em cost_logs. Ponto único de acesso à IA.
 */
export async function generate<T>(opts: GenerateOptions<T>): Promise<T> {
  const provider = pickProvider(opts.provider);
  const req: StructuredRequest<T> = {
    scenario: opts.scenario,
    system: opts.system,
    prompt: opts.prompt,
    schema: opts.schema,
    jsonSchema: opts.jsonSchema,
    model: opts.model,
    maxTokens: opts.maxTokens,
  };

  const maxAttempts = (opts.retries ?? 2) + 1;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await provider.generateStructured(req);
      await logCost(result, opts).catch(() => {});
      return result.data;
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Falha na geração de IA.");
}

async function logCost<T>(result: AiResult<T>, opts: GenerateOptions<T>): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const supabase = createServiceClient();
  await supabase.from("cost_logs").insert({
    tenant_id: opts.cost?.tenantId ?? null,
    user_id: opts.cost?.userId ?? null,
    content_id: opts.cost?.contentId ?? null,
    provider: result.usage.provider,
    model: result.usage.model,
    scenario: opts.scenario,
    input_tokens: result.usage.inputTokens,
    output_tokens: result.usage.outputTokens,
    cost_usd: estimateCostUsd(result.usage),
  });
}
