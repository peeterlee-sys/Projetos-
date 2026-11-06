import { describe, expect, it } from "vitest";
import {
  duracaoFinal,
  montarFilterComplex,
  parsearSilencios,
  planejarEncode,
  trechosParaManter,
} from "@/lib/video/corte";

/** Saída real do ffmpeg, com o prefixo que ele escreve no stderr. */
const SAIDA_FFMPEG = `
[silencedetect @ 0x5f0] silence_start: 6.012
[silencedetect @ 0x5f0] silence_end: 10.004 | silence_duration: 3.992
[silencedetect @ 0x5f0] silence_start: 16.01
[silencedetect @ 0x5f0] silence_end: 20.002 | silence_duration: 3.992
`;

describe("parsearSilencios", () => {
  it("lê os pares start/end da saída do ffmpeg", () => {
    expect(parsearSilencios(SAIDA_FFMPEG, 60)).toEqual([
      { inicio: 6.012, fim: 10.004 },
      { inicio: 16.01, fim: 20.002 },
    ]);
  });

  it("fecha no fim do vídeo quando ele termina em silêncio", () => {
    const saida = "[silencedetect @ 0x1] silence_start: 55.5";
    expect(parsearSilencios(saida, 60)).toEqual([{ inicio: 55.5, fim: 60 }]);
  });

  it("devolve lista vazia quando o vereador fala sem pausa", () => {
    expect(parsearSilencios("frame= 1800 fps=120", 60)).toEqual([]);
  });
});

describe("trechosParaManter", () => {
  it("inverte os silêncios deixando folga nas bordas", () => {
    const trechos = trechosParaManter([{ inicio: 10, fim: 20 }], 30, 0.1);
    expect(trechos).toEqual([
      { inicio: 0, fim: 10.1 },
      { inicio: 19.9, fim: 30 },
    ]);
  });

  it("mantém o vídeo inteiro quando não há silêncio", () => {
    expect(trechosParaManter([], 42)).toEqual([{ inicio: 0, fim: 42 }]);
  });

  it("não devolve trecho começando depois do fim quando o silêncio encosta no final", () => {
    const trechos = trechosParaManter([{ inicio: 25, fim: 30 }], 30, 0.1);
    expect(trechos).toEqual([{ inicio: 0, fim: 25.1 }]);
  });

  it("não deixa resto mudo quando o vereador demora a começar a falar", () => {
    const trechos = trechosParaManter([{ inicio: 0, fim: 3 }], 30, 0.1);
    expect(trechos).toEqual([{ inicio: 2.9, fim: 30 }]);
  });

  it("descarta sobra menor que um quadro, que viraria estalo no áudio", () => {
    const trechos = trechosParaManter(
      [
        { inicio: 0, fim: 10 },
        { inicio: 10.02, fim: 20 },
      ],
      20,
      0
    );
    expect(trechos).toEqual([]);
  });

  it("ordena os silêncios antes de inverter", () => {
    const trechos = trechosParaManter(
      [
        { inicio: 20, fim: 25 },
        { inicio: 5, fim: 10 },
      ],
      30,
      0
    );
    expect(trechos).toEqual([
      { inicio: 0, fim: 5 },
      { inicio: 10, fim: 20 },
      { inicio: 25, fim: 30 },
    ]);
  });
});

describe("duracaoFinal", () => {
  it("soma o que sobrou depois do corte", () => {
    const trechos = trechosParaManter([{ inicio: 10, fim: 20 }], 30, 0);
    expect(duracaoFinal(trechos)).toBe(20);
  });
});

describe("planejarEncode", () => {
  it("usa 1080 de altura num vídeo curto, que tem bitrate de sobra", () => {
    const plano = planejarEncode(30);
    expect(plano.altura).toBe(1920);
    expect(plano.excedeWhatsApp).toBe(false);
  });

  it("cai para 720 quando o orçamento de bits aperta", () => {
    const plano = planejarEncode(90);
    expect(plano.altura).toBe(1280);
    expect(plano.excedeWhatsApp).toBe(false);
  });

  it("avisa que precisa de link quando nem o menor preset cabe", () => {
    expect(planejarEncode(600).excedeWhatsApp).toBe(true);
  });

  it("mantém o arquivo projetado dentro do limite", () => {
    for (const segundos of [15, 30, 60, 90, 120, 180]) {
      const { videoKbps, audioKbps, excedeWhatsApp } = planejarEncode(segundos);
      if (excedeWhatsApp) continue;
      const megabytes = ((videoKbps + audioKbps) * 1000 * segundos) / 8 / 1024 / 1024;
      expect(megabytes).toBeLessThanOrEqual(16);
    }
  });

  it("não divide por zero num vídeo de duração zero", () => {
    expect(() => planejarEncode(0)).not.toThrow();
  });
});

describe("montarFilterComplex", () => {
  it("encadeia os trechos e fecha no concat", () => {
    const fc = montarFilterComplex([
      { inicio: 0, fim: 6 },
      { inicio: 10, fim: 16 },
    ]);
    expect(fc).toContain("[0:v]trim=0.000:6.000,setpts=PTS-STARTPTS[v0]");
    expect(fc).toContain("[0:a]atrim=10.000:16.000,asetpts=PTS-STARTPTS[a1]");
    expect(fc).toContain("[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]");
  });

  it("recusa vídeo sem nenhum trecho aproveitável", () => {
    expect(() => montarFilterComplex([])).toThrow(/Nenhum trecho/);
  });
});
