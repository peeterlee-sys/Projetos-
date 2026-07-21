import Anthropic from "@anthropic-ai/sdk";
import type { AiProvider, AiResult, StructuredRequest } from "./types";
import { extractJson } from "./json";

/**
 * Provedor Anthropic. Modelo padrão claude-opus-4-8 para geração e decisão;
 * claude-haiku-4-5 (mais barato) para classificação. Pensamento adaptativo
 * com esforço proporcional ao cenário.
 */
export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic" as const;
  private client: Anthropic;

  constructor(apiKey = process.env.ANTHROPIC_API_KEY) {
    this.client = new Anthropic({ apiKey });
  }

  private defaultModel(scenario: StructuredRequest<unknown>["scenario"]): string {
    return scenario === "classification" ? "claude-haiku-4-5" : "claude-opus-4-8";
  }

  async generateStructured<T>(req: StructuredRequest<T>): Promise<AiResult<T>> {
    const model = req.model ?? this.defaultModel(req.scenario);
    const isOpus = model.startsWith("claude-opus") || model.startsWith("claude-fable");

    const system = `${req.system}\n\nResponda SEMPRE e SOMENTE com JSON válido no formato:\n${JSON.stringify(
      req.jsonSchema
    )}\nSem markdown, sem comentários, apenas o objeto JSON.`;

    const params: Record<string, unknown> = {
      model,
      max_tokens: req.maxTokens ?? 4000,
      system,
      messages: [{ role: "user", content: req.prompt }],
    };
    // Pensamento adaptativo só nos modelos que o suportam (Opus/Fable).
    if (isOpus) {
      params.thinking = { type: "adaptive" };
      params.output_config = { effort: "high" };
    }

    const response = await this.client.messages.create(
      params as unknown as Anthropic.MessageCreateParamsNonStreaming
    );

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const data = req.schema.parse(extractJson(text));

    return {
      data,
      usage: {
        provider: this.name,
        model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
