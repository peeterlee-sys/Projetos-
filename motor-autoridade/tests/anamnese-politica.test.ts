import { describe, it, expect } from "vitest";
import { anamnesePoliticaSchema } from "@/lib/validation/anamnese-politica";

const minimo = {
  full_name: "José Carlos Souza",
  political_name: "Zé do Bairro",
  phone: "(47) 99184-8380",
  city: "São José",
  state: "SC",
};

describe("anamnesePoliticaSchema", () => {
  it("aceita o mínimo e aplica os padrões", () => {
    const r = anamnesePoliticaSchema.parse(minimo);
    expect(r.phone).toBe("5547991848380"); // normalizado para a busca do WhatsApp
    expect(r.political_spectrum).toBe("nao_declarado");
    expect(r.preferred_formats).toEqual(["video"]);
    expect(r.weekly_goal).toBe(3);
    expect(r.preferred_days).toEqual([1, 3, 5]);
    expect(r.flags).toEqual([]);
    expect(r.follow_up_level).toBe("balanced");
  });

  it("exige nome, nome de urna, cidade e UF", () => {
    for (const campo of ["full_name", "political_name", "city"] as const) {
      const r = anamnesePoliticaSchema.safeParse({ ...minimo, [campo]: "" });
      expect(r.success, campo).toBe(false);
    }
    expect(anamnesePoliticaSchema.safeParse({ ...minimo, state: "Santa Catarina" }).success).toBe(
      false
    );
  });

  it("recusa telefone que não é brasileiro", () => {
    const r = anamnesePoliticaSchema.safeParse({ ...minimo, phone: "12345" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/WhatsApp/);
  });

  it("guarda os limites do mandato como listas", () => {
    const r = anamnesePoliticaSchema.parse({
      ...minimo,
      forbidden_themes: ["aborto", "futebol"],
      adversaries: ["Fulano de Tal"],
      emojis: ["💪", "🙏"],
      slang_expressions: ["meu povo"],
    });
    expect(r.forbidden_themes).toHaveLength(2);
    expect(r.adversaries).toEqual(["Fulano de Tal"]);
    expect(r.emojis).toEqual(["💪", "🙏"]);
    expect(r.slang_expressions).toEqual(["meu povo"]);
  });

  it("limita fontes de influência a 80 e referências a 10", () => {
    const fonte = { kind: "site" as const, label: "x", url: "", priority: "medium" as const, is_blocked: false };
    const ref = { kind: "instagram" as const, url: "https://instagram.com/x", name: "" };
    expect(
      anamnesePoliticaSchema.safeParse({ ...minimo, influence_sources: Array(81).fill(fonte) }).success
    ).toBe(false);
    expect(
      anamnesePoliticaSchema.safeParse({ ...minimo, influence_sources: Array(80).fill(fonte) }).success
    ).toBe(true);
    expect(
      anamnesePoliticaSchema.safeParse({ ...minimo, inspiration_refs: Array(11).fill(ref) }).success
    ).toBe(false);
  });

  it("aceita números vindos como texto do formulário", () => {
    const r = anamnesePoliticaSchema.parse({
      ...minimo,
      weekly_goal: "5",
      publish_days_per_week: "4",
      video_duration_sec: "90",
    });
    expect(r.weekly_goal).toBe(5);
    expect(r.publish_days_per_week).toBe(4);
    expect(r.video_duration_sec).toBe(90);
  });
});
