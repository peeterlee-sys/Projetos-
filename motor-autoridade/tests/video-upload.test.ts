import { describe, expect, it } from "vitest";
import { estimarSegundosDeEnvio, formatarDuracao, mensagemDeErro } from "@/lib/video/upload";

describe("mensagemDeErro", () => {
  it("explica o limite do bucket no 413, que é a falha mais comum", () => {
    const m = mensagemDeErro(413, "", 55 * 1024 * 1024);
    expect(m).toContain("55MB");
    expect(m).toContain("limite");
  });

  it("manda entrar de novo quando a sessão caiu no meio do envio", () => {
    expect(mensagemDeErro(401, "", 1000)).toContain("sessão expirou");
    expect(mensagemDeErro(403, "", 1000)).toContain("sessão expirou");
  });

  it("aproveita a mensagem do servidor quando ela vem", () => {
    const m = mensagemDeErro(400, JSON.stringify({ message: "Bucket not found" }), 1000);
    expect(m).toContain("Bucket not found");
  });

  it("não quebra quando o corpo não é JSON", () => {
    const m = mensagemDeErro(500, "<html>Gateway</html>", 1000);
    expect(m).toContain("500");
  });
});

describe("estimarSegundosDeEnvio", () => {
  it("estima pelo tamanho: 55MB em 4 Mbps dão cerca de 2 minutos", () => {
    const s = estimarSegundosDeEnvio(55 * 1024 * 1024);
    expect(s).toBeGreaterThan(100);
    expect(s).toBeLessThan(130);
  });

  it("nunca promete menos de 5 segundos, nem num arquivo mínimo", () => {
    expect(estimarSegundosDeEnvio(1024)).toBe(5);
  });

  it("melhora a estimativa quando a rede é mais rápida", () => {
    const lenta = estimarSegundosDeEnvio(50 * 1024 * 1024, 4);
    const rapida = estimarSegundosDeEnvio(50 * 1024 * 1024, 40);
    expect(rapida).toBeLessThan(lenta);
  });
});

describe("formatarDuracao", () => {
  it("usa segundos abaixo de um minuto", () => {
    expect(formatarDuracao(45)).toBe("45s");
  });

  it("quebra em minutos para espera longa", () => {
    expect(formatarDuracao(90)).toBe("1 min 30s");
    expect(formatarDuracao(120)).toBe("2 min");
  });
});
