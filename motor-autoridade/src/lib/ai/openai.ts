import OpenAI from "openai";
import type { AiProvider, AiResult, StructuredRequest } from "./types";
import { extractJson } from "./json";

/**
 * Provedor OpenAI (alternativa trocável). Usa JSON mode e valida com o schema Zod.
 */
export class OpenAIProvider implements AiProvider {
  readonly name = "openai" as const;
  private client: OpenAI;

  constructor(apiKey = process.env.OPENAI_API_KEY) {
    this.client = new OpenAI({ apiKey });
  }

  private defaultModel(scenario: StructuredRequest<unknown>["scenario"]): string {
    return scenario === "classification" ? "gpt-4.1-mini" : "gpt-4.1";
  }

  async generateStructured<T>(req: StructuredRequest<T>): Promise<AiResult<T>> {
    const model = req.model ?? this.defaultModel(req.scenario);

    const system = `${req.system}\n\nResponda SEMPRE e SOMENTE com JSON válido no formato:\n${JSON.stringify(
      req.jsonSchema
    )}`;

    const completion = await this.client.chat.completions.create({
      model,
      max_tokens: req.maxTokens ?? 4000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: req.prompt },
      ],
    });

    const text = completion.choices[0]?.message?.content ?? "";
    const data = req.schema.parse(extractJson(text));

    return {
      data,
      usage: {
        provider: this.name,
        model,
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0,
      },
    };
  }
}
