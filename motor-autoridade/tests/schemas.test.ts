import { describe, it, expect } from "vitest";
import { FORMAT_SCHEMAS } from "@/lib/ai/schemas";

describe("Schemas dos formatos (MÓDULO 4)", () => {
  it("valida um roteiro de vídeo completo", () => {
    const ok = FORMAT_SCHEMAS.video.safeParse({
      title: "t",
      cover_text: "c",
      hook: "h",
      body: "b",
      caption: "l",
      cta: "cta",
      recording_tips: "dica",
      duration_sec: 60,
    });
    expect(ok.success).toBe(true);
  });

  it("rejeita vídeo sem campos obrigatórios", () => {
    const bad = FORMAT_SCHEMAS.video.safeParse({ title: "só isso" });
    expect(bad.success).toBe(false);
  });

  it("exige entre 3 e 10 lâminas no carrossel", () => {
    const few = FORMAT_SCHEMAS.carousel.safeParse({
      cover: "c",
      slides: [{ headline: "a", phrase: "b" }],
      final_text: "f",
      cta: "cta",
      caption: "l",
    });
    expect(few.success).toBe(false);
  });

  it("aceita story com poll nulo", () => {
    const ok = FORMAT_SCHEMAS.story.safeParse({
      sequence: [{ text: "quadro" }],
      poll: null,
      question_box: null,
      cta: "cta",
    });
    expect(ok.success).toBe(true);
  });
});
