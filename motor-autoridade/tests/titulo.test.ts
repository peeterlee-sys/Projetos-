import { describe, expect, it } from "vitest";
import { tituloDeExibicao, tituloFromConteudo } from "../src/lib/atividades/titulo";

describe("tituloFromConteudo", () => {
  it("usa a primeira linha com conteúdo, sem o negrito do WhatsApp", () => {
    expect(tituloFromConteudo("\n\n*REQUERIMENTO Nº ___/2026*\n\nExmo. Sr.")).toBe(
      "REQUERIMENTO Nº ___/2026"
    );
  });

  it("preserva a lacuna dos documentos legislativos", () => {
    expect(tituloFromConteudo("*PROJETO DE LEI Nº ___/2026*")).toContain("___");
  });

  it("corta títulos muito longos", () => {
    const t = tituloFromConteudo("A".repeat(200));
    expect(t).toHaveLength(78);
    expect(t.endsWith("…")).toBe(true);
  });

  it("não quebra com texto em branco", () => {
    expect(tituloFromConteudo("   \n  \n")).toBe("Documento gerado");
  });
});

describe("tituloDeExibicao", () => {
  const MATERIA =
    "*1. MATÉRIA JORNALÍSTICA*\nVereador cobra reforma da UBS do Centro\n\n*2. LEGENDA*\nTexto";

  it("troca o rótulo da seção pela manchete de verdade", () => {
    expect(tituloDeExibicao("1. MATÉRIA JORNALÍSTICA", MATERIA)).toBe(
      "Vereador cobra reforma da UBS do Centro"
    );
  });

  it("mantém o título quando ele já é informativo", () => {
    const t = "Câmara debate regras para transporte";
    expect(tituloDeExibicao(t, `${t}\n\nCorpo da matéria.`)).toBe(t);
  });

  it("não mexe em requerimento e projeto de lei", () => {
    const t = "PROJETO DE LEI Nº ___/2026";
    expect(tituloDeExibicao(t, `*${t}*\n\nArt. 1º ...`)).toBe(t);
  });

  it("cai no título salvo se não houver outra linha útil", () => {
    expect(tituloDeExibicao("1. ABERTURA", "*1. ABERTURA*")).toBe("1. ABERTURA");
  });
});
