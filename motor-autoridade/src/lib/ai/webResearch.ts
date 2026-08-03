import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { extractJson } from "./json";

/**
 * Geração estruturada COM busca na web (Anthropic web_search). Usada quando a
 * saída precisa refletir fatos atuais/recentes — ex.: pauta sugerida pelo
 * cliente sobre um assunto do momento. A IA pesquisa, e ao final responde
 * apenas com o JSON pedido (dentro de ```json).
 *
 * Lança em caso de falha; o chamador decide o fallback.
 */
export async function generateWithWebSearch<T>(opts: {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxSearches?: number;
  maxTokens?: number;
}): Promise<T> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.replace(/[^\x20-\x7E]/g, "").trim();
  const client = new Anthropic({ apiKey });

  const system = `${opts.system}

Você tem acesso à ferramenta de busca na web. Pesquise fatos ATUAIS e RECENTES
relevantes ao tema antes de responder. Ao final, responda SOMENTE com o objeto
JSON pedido, dentro de um bloco \`\`\`json ... \`\`\`, sem nenhum texto depois.`;

  const params = {
    model: "claude-opus-4-8",
    max_tokens: opts.maxTokens ?? 2500,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: opts.maxSearches ?? 3 }],
    system,
    messages: [{ role: "user", content: opts.prompt }],
  };

  const response = await client.messages.create(
    params as unknown as Anthropic.MessageCreateParamsNonStreaming,
  );

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  return opts.schema.parse(extractJson(text));
}
