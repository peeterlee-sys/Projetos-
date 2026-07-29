import { describe, expect, it } from "vitest";
import { decodeBase64Text } from "../src/lib/atividades/decode";

const DOCUMENTO =
  'REQUERIMENTO Nº ___/2026\n\nO vereador afirmou: "vamos cobrar a Prefeitura".\n' +
  "Atenção à situação da população — ação já!";

describe("decodeBase64Text", () => {
  it("devolve o texto intacto quando o Make manda em UTF-8", () => {
    const b64 = Buffer.from(DOCUMENTO, "utf8").toString("base64");
    expect(decodeBase64Text(b64)).toBe(DOCUMENTO);
  });

  it("recupera os acentos quando o Make manda em latin1", () => {
    // Sem travessão: ele não existe em latin1 e se perderia já na codificação,
    // então aqui medimos só o que a decodificação consegue recuperar.
    const texto = 'Atenção à situação: "ação já!"';
    const b64 = Buffer.from(texto, "latin1").toString("base64");
    expect(decodeBase64Text(b64)).toBe(texto);
  });

  it("preserva aspas e quebras de linha", () => {
    const b64 = Buffer.from(DOCUMENTO, "utf8").toString("base64");
    const out = decodeBase64Text(b64);
    expect(out).toContain('"vamos cobrar a Prefeitura"');
    expect(out.split("\n")).toHaveLength(4);
  });

  it("não quebra com base64 vazio", () => {
    expect(decodeBase64Text("")).toBe("");
  });
});
