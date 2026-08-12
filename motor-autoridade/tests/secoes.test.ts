import { describe, expect, it } from "vitest";
import { dividirEmSecoes } from "../src/lib/atividades/secoes";

/** Saída real do fluxo de "comunicação": 4 entregas num texto só. */
const MATERIA = `*1. HEADLINE*
Vereador cobra reforma da UBS do Centro

*2. RELEASE PARA IMPRENSA*
O vereador protocolou nesta terça-feira um pedido de reforma.
"A população não pode esperar mais", afirmou.

*3. LEGENDA PARA INSTAGRAM*
🏥 Nossa saúde não pode esperar! #Saúde #Tijucas

*4. TEXTO PARA WHATSAPP*
Pessoal, cobrei hoje a reforma da UBS do Centro.`;

const REQUERIMENTO = `*REQUERIMENTO Nº ___/2026*

Exmo. Sr. Presidente da Câmara Municipal de Tijucas,

O vereador abaixo assinado requer, na forma regimental, que seja oficiado
ao Executivo Municipal solicitando informações sobre:

1. o cronograma da obra;
2. o valor empenhado até o momento.

Nestes termos, pede deferimento.`;

describe("dividirEmSecoes", () => {
  it("separa as quatro entregas de uma matéria", () => {
    const s = dividirEmSecoes(MATERIA);
    expect(s.map((x) => x.titulo)).toEqual([
      "HEADLINE",
      "RELEASE PARA IMPRENSA",
      "LEGENDA PARA INSTAGRAM",
      "TEXTO PARA WHATSAPP",
    ]);
  });

  it("mantém o conteúdo de cada seção separado e limpo", () => {
    const s = dividirEmSecoes(MATERIA);
    expect(s[0].conteudo).toBe("Vereador cobra reforma da UBS do Centro");
    expect(s[2].conteudo).toContain("#Tijucas");
    expect(s[2].conteudo).not.toContain("TEXTO PARA WHATSAPP");
  });

  it("não picota requerimento: itens numerados do corpo não viram seção", () => {
    expect(dividirEmSecoes(REQUERIMENTO)).toEqual([]);
  });

  it("devolve vazio para texto corrido, sinalizando exibição inteira", () => {
    expect(dividirEmSecoes("Um discurso qualquer, sem estrutura numerada.")).toEqual([]);
  });

  it("aguenta cabeçalho sem asterisco", () => {
    const s = dividirEmSecoes("1. ABERTURA\nBom dia a todos.\n2. FECHAMENTO\nObrigado.");
    expect(s).toHaveLength(2);
    expect(s[1].conteudo).toBe("Obrigado.");
  });

  it("preserva texto que vem antes da primeira seção", () => {
    const s = dividirEmSecoes("Segue o material:\n*1. HEADLINE*\nA\n*2. LEGENDA*\nB");
    expect(s[0]).toEqual({ titulo: "", conteudo: "Segue o material:" });
    expect(s).toHaveLength(3);
  });

  it("não quebra com texto vazio", () => {
    expect(dividirEmSecoes("")).toEqual([]);
  });
});
