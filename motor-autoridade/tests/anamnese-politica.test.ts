import { describe, it, expect } from "vitest";
import { anamnesePoliticaSchema } from "@/lib/validation/anamnese-politica";

/**
 * Espelha o Google Form "Assessor 24h - Anamnese" (6 seções). Este é o
 * conjunto mínimo de respostas válidas — cada pergunta obrigatória do
 * formulário original precisa estar aqui.
 */
const minimo = {
  full_name: "José Carlos Souza",
  political_name: "Zé do Bairro",
  city: "São José",
  state: "SC",
  party: "PSD",
  mandate: "1º mandato",
  positions: ["Nenhum"],
  phone: "(47) 99184-8380",
  political_spectrum: "nao_declarado",
  flags: ["Saúde"],
  electoral_base: "Centro e Vila Nova",
  voter_profile: "Famílias de classe média",
  tone_of_voice: "Próximo e popular, linguagem simples",
  slang_style: "Pode usar à vontade, faz parte do meu jeito",
  emoji_style: "Poucos e pontuais",
  how_to_refer: "Apenas o nome político",
  catchphrase: "Não",
  forbidden_themes: ["Nenhum"],
  adversaries: ["Nenhum"],
  mayor_relation: "Independente — avalio caso a caso",
  history_to_avoid: "Nenhum",
  lgpd_consent: true,
};

describe("anamnesePoliticaSchema", () => {
  it("aceita o mínimo exigido pelo formulário e normaliza o telefone", () => {
    const r = anamnesePoliticaSchema.parse(minimo);
    expect(r.phone).toBe("5547991848380");
    expect(r.instagram_url).toBe("");
    expect(r.reference_publications).toEqual([]);
    expect(r.local_press).toEqual([]);
  });

  it("recusa quando falta qualquer pergunta obrigatória", () => {
    for (const campo of [
      "full_name",
      "political_name",
      "city",
      "state",
      "party",
      "electoral_base",
      "voter_profile",
      "catchphrase",
      "history_to_avoid",
    ] as const) {
      const r = anamnesePoliticaSchema.safeParse({ ...minimo, [campo]: "" });
      expect(r.success, campo).toBe(false);
    }
  });

  it("exige as respostas de múltipla escolha entre as alternativas do formulário", () => {
    expect(
      anamnesePoliticaSchema.safeParse({ ...minimo, mandate: "4º mandato" }).success
    ).toBe(false);
    expect(
      anamnesePoliticaSchema.safeParse({ ...minimo, political_spectrum: "centro_direita" }).success
    ).toBe(false); // o formulário real não tem essa opção
    expect(
      anamnesePoliticaSchema.safeParse({ ...minimo, tone_of_voice: "Debochado" }).success
    ).toBe(false);
    expect(
      anamnesePoliticaSchema.safeParse({ ...minimo, mayor_relation: "Situação" }).success
    ).toBe(false); // não é o texto exato do formulário
  });

  it("limita as bandeiras a 3, exige ao menos 1", () => {
    expect(anamnesePoliticaSchema.safeParse({ ...minimo, flags: [] }).success).toBe(false);
    expect(
      anamnesePoliticaSchema.safeParse({
        ...minimo,
        flags: ["Saúde", "Educação", "Cultura", "Turismo"],
      }).success
    ).toBe(false);
    expect(
      anamnesePoliticaSchema.safeParse({ ...minimo, flags: ["Saúde", "Educação", "Cultura"] })
        .success
    ).toBe(true);
  });

  it("recusa telefone que não é brasileiro", () => {
    const r = anamnesePoliticaSchema.safeParse({ ...minimo, phone: "12345" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/WhatsApp/);
  });

  it("exige o consentimento LGPD para aceitar a anamnese", () => {
    expect(anamnesePoliticaSchema.safeParse({ ...minimo, lgpd_consent: false }).success).toBe(
      false
    );
  });

  it("aceita as referências (seção 5) como opcionais", () => {
    const r = anamnesePoliticaSchema.parse({
      ...minimo,
      instagram_url: "https://instagram.com/zedobairro",
      reference_publications: ["https://instagram.com/p/123"],
      local_press: ["Rádio Cidade AM"],
    });
    expect(r.instagram_url).toBe("https://instagram.com/zedobairro");
    expect(r.local_press).toEqual(["Rádio Cidade AM"]);
  });
});
