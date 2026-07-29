import { describe, expect, it } from "vitest";
import { dividirParaWhatsApp, LIMITE_WHATSAPP } from "../src/lib/atividades/dividir";

/** Projeto de lei realista: artigos separados por linha em branco. */
function projetoDeLei(artigos: number): string {
  const corpo = Array.from(
    { length: artigos },
    (_, i) =>
      `Art. ${i + 1}º Fica instituído o programa municipal de acompanhamento, ` +
      "cabendo ao Executivo a regulamentação, fiscalização e a divulgação " +
      `periódica dos resultados obtidos junto à população do município.`
  );
  return ["*PROJETO DE LEI Nº ___/2026*", "Ementa: dispõe sobre o programa.", ...corpo].join(
    "\n\n"
  );
}

describe("dividirParaWhatsApp", () => {
  it("devolve o documento inteiro, sem marcador, quando já cabe", () => {
    const curto = "*REQUERIMENTO Nº ___/2026*\n\nTexto curto do requerimento.";
    expect(dividirParaWhatsApp(curto)).toEqual([curto]);
  });

  it("nenhuma parte ultrapassa o limite do WhatsApp", () => {
    const partes = dividirParaWhatsApp(projetoDeLei(60));
    expect(partes.length).toBeGreaterThan(1);
    for (const p of partes) expect(p.length).toBeLessThanOrEqual(LIMITE_WHATSAPP);
  });

  it("numera as partes para o vereador saber que há continuação", () => {
    const partes = dividirParaWhatsApp(projetoDeLei(60));
    expect(partes[0].startsWith(`(1/${partes.length}) `)).toBe(true);
    expect(partes.at(-1)!.startsWith(`(${partes.length}/${partes.length}) `)).toBe(true);
  });

  it("não corta no meio de uma palavra", () => {
    for (const p of dividirParaWhatsApp(projetoDeLei(60))) {
      const semMarcador = p.replace(/^\(\d+\/\d+\) /, "");
      expect(semMarcador.trimEnd()).toMatch(/[.:;)\]"*º]$/);
    }
  });

  it("preserva o documento inteiro ao juntar as partes de volta", () => {
    const original = projetoDeLei(60);
    const juntado = dividirParaWhatsApp(original)
      .map((p) => p.replace(/^\(\d+\/\d+\) /, ""))
      .join("\n\n");
    expect(juntado).toBe(original);
  });

  it("aguenta um parágrafo único gigante, sem quebra de linha nenhuma", () => {
    const partes = dividirParaWhatsApp("A".repeat(12000));
    expect(partes.length).toBeGreaterThan(2);
    for (const p of partes) expect(p.length).toBeLessThanOrEqual(LIMITE_WHATSAPP);
  });

  it("devolve lista vazia para texto em branco", () => {
    expect(dividirParaWhatsApp("   \n  ")).toEqual([]);
  });
});
