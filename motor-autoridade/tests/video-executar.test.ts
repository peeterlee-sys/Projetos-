import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cortarSilencio } from "@/lib/video/executar";

const exec = promisify(execFile);

/**
 * Teste de integração: roda o ffmpeg de verdade, o mesmo binário que vai para
 * a Vercel. Os testes de `video-corte` cobrem a regra; este cobre o acordo com
 * o ffmpeg, que é onde erram os detalhes — foi assim que apareceu o conflito
 * entre `-vf` e `filter_complex`, que não quebra teste de unidade nenhum e
 * quebra a rota inteira em produção.
 */

let dir: string;
let videoComPausas: Buffer;

/** 20s de vídeo: fala 6s, silêncio 4s, fala 6s, silêncio 4s. */
async function gerarVideo(destino: string) {
  await exec(ffmpegPath as string, [
    "-y", "-loglevel", "error",
    "-f", "lavfi", "-i", "testsrc2=size=360x640:rate=15:duration=20",
    "-f", "lavfi", "-i", "sine=frequency=300:duration=20",
    "-filter_complex", "[1:a]volume='if(lt(mod(t,10),6),1,0)':eval=frame[a]",
    "-map", "0:v", "-map", "[a]",
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "34",
    "-c:a", "aac", "-t", "20", destino,
  ], { maxBuffer: 32 * 1024 * 1024 });
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "teste-video-"));
  const caminho = join(dir, "origem.mp4");
  await gerarVideo(caminho);
  videoComPausas = await readFile(caminho);
}, 120_000);

afterAll(async () => {
  await rm(dir, { recursive: true, force: true }).catch(() => {});
});

describe("cortarSilencio", () => {
  it("remove as pausas e devolve um MP4 mais curto que o original", async () => {
    const r = await cortarSilencio(videoComPausas);

    expect(Math.round(r.duracaoOriginal)).toBe(20);
    // 8s dos 20 são silêncio; a folga nas bordas devolve uma fração.
    expect(r.duracaoFinal).toBeGreaterThan(11);
    expect(r.duracaoFinal).toBeLessThan(14);
    expect(r.trechos).toBeGreaterThanOrEqual(2);
    expect(r.excedeWhatsApp).toBe(false);

    // 'ftyp' nos primeiros bytes: é um MP4 de verdade, não lixo.
    expect(r.arquivo.subarray(4, 8).toString("latin1")).toBe("ftyp");
    expect(r.arquivo.byteLength).toBeGreaterThan(1000);
  }, 180_000);

  it("recusa arquivo que não é vídeo em vez de devolver lixo", async () => {
    await expect(cortarSilencio(Buffer.from("isto não é um vídeo"))).rejects.toThrow(
      /Não foi possível ler o vídeo/
    );
  }, 60_000);
});
