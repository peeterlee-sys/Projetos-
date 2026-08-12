import { describe, expect, it } from "vitest";
import { limparMarcadores } from "../src/lib/atividades/limpar";

describe("limparMarcadores", () => {
  it("tira o marcador de parte do começo do texto", () => {
    expect(limparMarcadores("(1/3) *PROJETO DE LEI Nº ___/2026*")).toBe(
      "*PROJETO DE LEI Nº ___/2026*"
    );
  });

  it("tira marcadores de partes emendadas", () => {
    const texto = "(1/2) Art. 1º Fica instituído.\n(2/2) Art. 2º Esta lei entra em vigor.";
    expect(limparMarcadores(texto)).toBe(
      "Art. 1º Fica instituído.\nArt. 2º Esta lei entra em vigor."
    );
  });

  it("aguenta espaço em volta da barra", () => {
    expect(limparMarcadores("( 2 / 10 ) Texto")).toBe("Texto");
  });

  it("não mexe em parênteses legítimos do documento", () => {
    const texto = "O prazo é de trinta (30) dias, conforme o art. 5º (caput).";
    expect(limparMarcadores(texto)).toBe(texto);
  });

  it("não remove numeração de artigos nem de incisos", () => {
    const texto = "1. o cronograma da obra;\n2. o valor empenhado.";
    expect(limparMarcadores(texto)).toBe(texto);
  });

  it("não quebra com texto vazio", () => {
    expect(limparMarcadores("")).toBe("");
  });
});
