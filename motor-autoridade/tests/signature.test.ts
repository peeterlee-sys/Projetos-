import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { verifyMakeSignature } from "@/lib/make/signature";

const SECRET = "segredo-de-teste-1234";
function sign(body: string): string {
  return "sha256=" + crypto.createHmac("sha256", SECRET).update(body).digest("hex");
}

describe("verifyMakeSignature (MÓDULO 14 — webhook autenticado)", () => {
  it("aceita assinatura válida", () => {
    const body = JSON.stringify({ action: "get_profile" });
    expect(verifyMakeSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejeita corpo adulterado", () => {
    const sig = sign('{"action":"get_profile"}');
    expect(verifyMakeSignature('{"action":"deliver_opportunity"}', sig, SECRET)).toBe(false);
  });

  it("rejeita assinatura ausente", () => {
    expect(verifyMakeSignature("{}", null, SECRET)).toBe(false);
  });

  it("rejeita segredo ausente", () => {
    expect(verifyMakeSignature("{}", sign("{}"), undefined)).toBe(false);
  });

  it("rejeita assinatura com tamanho diferente", () => {
    expect(verifyMakeSignature("{}", "sha256=abc", SECRET)).toBe(false);
  });
});
