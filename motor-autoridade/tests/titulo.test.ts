import { describe, expect, it } from "vitest";
import { tituloFromConteudo } from "../src/lib/atividades/titulo";

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
