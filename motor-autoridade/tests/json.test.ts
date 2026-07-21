import { describe, it, expect } from "vitest";
import { extractJson } from "@/lib/ai/json";

describe("extractJson (parsing robusto da IA)", () => {
  it("faz parse de JSON puro", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("remove cercas de código markdown", () => {
    expect(extractJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
  });

  it("recorta objeto de texto ao redor", () => {
    expect(extractJson('Aqui está: {"a":3} pronto.')).toEqual({ a: 3 });
  });

  it("lança erro quando não há JSON", () => {
    expect(() => extractJson("sem json aqui")).toThrow();
  });
});
