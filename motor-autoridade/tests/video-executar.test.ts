import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
let videoDoIphone: Buffer;
let videoEmPe: Buffer;

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

/**
 * Como a câmera do iPhone entrega: HEVC dentro de um container QuickTime.
 * O vereador grava no celular, então é este o arquivo que chega na prática.
 */
async function gerarVideoIphone(destino: string) {
  await exec(ffmpegPath as string, [
    "-y", "-loglevel", "error",
    "-f", "lavfi", "-i", "testsrc2=size=360x640:rate=15:duration=20",
    "-f", "lavfi", "-i", "sine=frequency=300:duration=20",
    "-filter_complex", "[1:a]volume='if(lt(mod(t,10),6),1,0)':eval=frame[a]",
    "-map", "0:v", "-map", "[a]",
    "-c:v", "libx265", "-tag:v", "hvc1", "-preset", "ultrafast", "-crf", "34",
    "-c:a", "aac", "-t", "20", destino,
  ], { maxBuffer: 32 * 1024 * 1024 });
}

/**
 * Celular segurado em pé grava deitado e marca a rotação nos metadados: o
 * arquivo tem 640x360 e uma rotação de 90° que o faz exibir 360x640. Quem
 * ignora essa marca publica o vereador de lado.
 */
async function gerarVideoEmPe(destino: string) {
  const deitado = destino.replace(/\.mov$/, "-deitado.mp4");
  await exec(ffmpegPath as string, [
    "-y", "-loglevel", "error",
    "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=15:duration=12",
    "-f", "lavfi", "-i", "sine=frequency=300:duration=12",
    "-filter_complex", "[1:a]volume='if(lt(mod(t,6),4),1,0)':eval=frame[a]",
    "-map", "0:v", "-map", "[a]",
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "34",
    "-c:a", "aac", "-t", "12", deitado,
  ], { maxBuffer: 32 * 1024 * 1024 });

  await exec(ffmpegPath as string, [
    "-y", "-loglevel", "error", "-display_rotation", "90", "-i", deitado, "-c", "copy", destino,
  ], { maxBuffer: 32 * 1024 * 1024 });
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "teste-video-"));

  const caminho = join(dir, "origem.mp4");
  await gerarVideo(caminho);
  videoComPausas = await readFile(caminho);

  const iphone = join(dir, "iphone.mov");
  await gerarVideoIphone(iphone);
  videoDoIphone = await readFile(iphone);

  const emPe = join(dir, "em-pe.mov");
  await gerarVideoEmPe(emPe);
  videoEmPe = await readFile(emPe);
}, 180_000);

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

  it("corta o HEVC em .mov que a câmera do iPhone entrega", async () => {
    const r = await cortarSilencio(videoDoIphone);

    expect(Math.round(r.duracaoOriginal)).toBe(20);
    expect(r.duracaoFinal).toBeLessThan(r.duracaoOriginal);
    expect(r.arquivo.subarray(4, 8).toString("latin1")).toBe("ftyp");
  }, 180_000);

  it("mantém em pé o vídeo gravado em pé, em vez de publicar o vereador deitado", async () => {
    const r = await cortarSilencio(videoEmPe);
    const saida = join(dir, "saida-em-pe.mp4");
    await writeFile(saida, r.arquivo);

    const { stderr } = await exec(ffmpegPath as string, ["-hide_banner", "-i", saida], {
      maxBuffer: 32 * 1024 * 1024,
    }).catch((e) => e as { stderr: string });

    const dim = stderr.match(/Video:.*?\s(\d{2,5})x(\d{2,5})/);
    expect(dim).not.toBeNull();
    const [largura, altura] = [Number(dim![1]), Number(dim![2])];
    expect(altura).toBeGreaterThan(largura);
  }, 180_000);

  it("recusa arquivo que não é vídeo em vez de devolver lixo", async () => {
    await expect(cortarSilencio(Buffer.from("isto não é um vídeo"))).rejects.toThrow(
      /Não foi possível ler o vídeo/
    );
  }, 60_000);
});
