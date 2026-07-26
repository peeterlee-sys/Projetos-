import { describe, it, expect } from "vitest";
import { normalizePhoneBR, phoneVariants, formatPhoneBR, digitsOnly } from "@/lib/phone";

describe("normalizePhoneBR", () => {
  it("adiciona o DDI a números locais", () => {
    expect(normalizePhoneBR("47991848380")).toBe("5547991848380");
    expect(normalizePhoneBR("4733332222")).toBe("554733332222");
  });

  it("aceita máscara, espaços e '+'", () => {
    expect(normalizePhoneBR("+55 (47) 99184-8380")).toBe("5547991848380");
    expect(normalizePhoneBR("(47) 99184-8380")).toBe("5547991848380");
  });

  it("remove zeros de discagem", () => {
    expect(normalizePhoneBR("047991848380")).toBe("5547991848380");
    expect(normalizePhoneBR("005547991848380")).toBe("5547991848380");
  });

  it("preserva quem já está canônico", () => {
    expect(normalizePhoneBR("5547991848380")).toBe("5547991848380");
    expect(normalizePhoneBR("554799184838")).toBe("554799184838");
  });

  it("recusa entradas que não são telefone brasileiro", () => {
    expect(normalizePhoneBR("")).toBeNull();
    expect(normalizePhoneBR(null)).toBeNull();
    expect(normalizePhoneBR("telefone")).toBeNull();
    expect(normalizePhoneBR("12345")).toBeNull();
    expect(normalizePhoneBR("5501991848380")).toBeNull(); // DDD 01 não existe
    expect(normalizePhoneBR("449911223344")).toBeNull(); // 12 dígitos sem DDI 55
  });
});

describe("phoneVariants", () => {
  it("gera as duas formas do celular (com e sem o 9º dígito)", () => {
    expect(phoneVariants("5547991848380").sort()).toEqual(
      ["5547991848380", "554791848380"].sort()
    );
    expect(phoneVariants("554791848380").sort()).toEqual(
      ["554791848380", "5547991848380"].sort()
    );
  });

  it("não inventa variante para fixo", () => {
    expect(phoneVariants("554733332222")).toEqual(["554733332222"]);
  });

  it("devolve lista vazia quando o número é inválido", () => {
    expect(phoneVariants("nada")).toEqual([]);
  });
});

describe("formatPhoneBR", () => {
  it("formata celular e fixo", () => {
    expect(formatPhoneBR("5547991848380")).toBe("(47) 99184-8380");
    expect(formatPhoneBR("554733332222")).toBe("(47) 3333-2222");
  });

  it("devolve a entrada original quando não normaliza", () => {
    expect(formatPhoneBR("ramal 22")).toBe("ramal 22");
    expect(formatPhoneBR(null)).toBe("");
  });
});

describe("digitsOnly", () => {
  it("mantém só dígitos", () => {
    expect(digitsOnly("+55 (47) 99184-8380")).toBe("5547991848380");
  });
});
