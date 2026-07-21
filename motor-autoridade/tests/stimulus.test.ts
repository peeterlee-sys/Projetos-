import { describe, it, expect } from "vitest";
import { pickStimulus, type StimulusSignals } from "@/lib/behavior/stimulus";

const base: StimulusSignals = {
  publishedThisWeek: 0,
  weeklyGoal: 3,
  hasOpportunityToday: false,
  recordedNotPublished: false,
  openedNotProduced: false,
  daysSinceLastActivity: 1,
};

describe("pickStimulus (MÓDULO 8 — sem culpa)", () => {
  it("prioriza vídeo gravado e não publicado", () => {
    const r = pickStimulus({ ...base, recordedNotPublished: true });
    expect(r.situation).toBe("recorded_not_published");
    expect(r.message).toMatch(/publicar/i);
  });

  it("detecta retorno após pausa (>= 7 dias)", () => {
    const r = pickStimulus({ ...base, daysSinceLastActivity: 10 });
    expect(r.situation).toBe("returned_after_pause");
  });

  it("reconhece meta concluída", () => {
    const r = pickStimulus({ ...base, publishedThisWeek: 3, weeklyGoal: 3 });
    expect(r.situation).toBe("goal_done");
  });

  it("reconhece que está perto da meta", () => {
    const r = pickStimulus({ ...base, publishedThisWeek: 2, weeklyGoal: 3 });
    expect(r.situation).toBe("near_goal");
  });

  it("cai em radar quieto quando não há oportunidade", () => {
    const r = pickStimulus(base);
    expect(r.situation).toBe("radar_quiet");
  });

  it("nunca gera mensagem vazia", () => {
    const r = pickStimulus({ ...base, hasOpportunityToday: true });
    expect(r.message.length).toBeGreaterThan(0);
  });
});
