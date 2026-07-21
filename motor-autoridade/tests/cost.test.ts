import { describe, it, expect } from "vitest";
import { estimateCostUsd } from "@/lib/ai/cost";

describe("estimateCostUsd (MÓDULO 18 — custos)", () => {
  it("calcula custo do Opus por tokens", () => {
    // 1M input * $5 + 1M output * $25 = $30
    const c = estimateCostUsd({
      provider: "anthropic",
      model: "claude-opus-4-8",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(c).toBeCloseTo(30, 5);
  });

  it("retorna 0 para modelo desconhecido", () => {
    const c = estimateCostUsd({
      provider: "openai",
      model: "modelo-inexistente",
      inputTokens: 1000,
      outputTokens: 1000,
    });
    expect(c).toBe(0);
  });
});
