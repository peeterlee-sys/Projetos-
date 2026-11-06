import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import {
  MIN_SILENCIO_PADRAO,
  RUIDO_PADRAO,
  duracaoFinal,
  montarFilterComplex,
  parsearDuracao,
  parsearSilencios,
  planejarEncode,
  trechosParaManter,
} from "./corte";

const exec = promisify(execFile);

/** O ffmpeg fala muito no stderr; um vídeo longo passa fácil do buffer padrão. */
const BUFFER = 64 * 1024 * 1024;

/** Acima disso o arquivo não cabe no /tmp da função junto com a saída. */
export const LIMITE_ENTRADA_MB = 180;

export type Resultado = {
  arquivo: Buffer;
  duracaoOriginal: number;
  duracaoFinal: number;
  trechos: number;
  excedeWhatsApp: boolean;
};

function binario(): string {
  if (!ffmpegPath) throw new Error("ffmpeg não disponível neste ambiente.");
  return ffmpegPath;
}

/**
 * O ffmpeg sai com código diferente de zero em `-f null -`, e o que interessa
 * está no stderr de qualquer forma. Então capturamos stderr nos dois casos.
 */
async function stderrDe(args: string[]): Promise<string> {
  try {
    const { stderr } = await exec(binario(), args, { maxBuffer: BUFFER });
    return stderr;
  } catch (err) {
    const e = err as { stderr?: string };
    if (typeof e.stderr === "string") return e.stderr;
    throw err;
  }
}

/**
 * Corta as pausas do vídeo do vereador e devolve o arquivo já codificado para
 * caber no WhatsApp.
 *
 * São duas passadas pelo ffmpeg: a primeira só analisa (detecta silêncio e lê
 * a duração, sem escrever vídeo), a segunda corta e recodifica. Analisar é
 * barato; é a recodificação que custa o tempo.
 *
 * Trabalha em diretório temporário próprio e limpa no fim — em função
 * serverless o /tmp é compartilhado entre invocações do mesmo contêiner, e
 * sobra de execução anterior enche o disco.
 */
export async function cortarSilencio(entrada: Buffer): Promise<Resultado> {
  const dir = await mkdtemp(join(tmpdir(), "corte-"));
  const origem = join(dir, "origem.mp4");
  const destino = join(dir, "saida.mp4");

  try {
    await writeFile(origem, entrada);

    // Passada 1: análise. '-f null -' descarta a saída de vídeo.
    const analise = await stderrDe([
      "-hide_banner",
      "-i",
      origem,
      "-af",
      `silencedetect=noise=${RUIDO_PADRAO}:d=${MIN_SILENCIO_PADRAO}`,
      "-f",
      "null",
      "-",
    ]);

    const duracao = parsearDuracao(analise);
    if (!duracao) throw new Error("Não foi possível ler o vídeo. Envie um MP4 ou MOV.");

    const trechos = trechosParaManter(parsearSilencios(analise, duracao), duracao);
    if (trechos.length === 0) {
      throw new Error("O vídeo está sem áudio audível — nada para cortar.");
    }

    const final = duracaoFinal(trechos);
    const plano = planejarEncode(final);

    // Passada 2: corta, emenda e recodifica no tamanho alvo. O filtro vai em
    // arquivo porque num vídeo com muitas pausas ele passa do limite de
    // tamanho de argumento do sistema.
    const filtro = join(dir, "filtro.txt");
    await writeFile(filtro, montarFilterComplex(trechos, plano.altura));

    await exec(
      binario(),
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        origem,
        "-filter_complex_script",
        filtro,
        "-map",
        "[v]",
        "-map",
        "[a]",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-b:v",
        `${plano.videoKbps}k`,
        "-maxrate",
        `${plano.videoKbps}k`,
        "-bufsize",
        `${plano.videoKbps * 2}k`,
        "-c:a",
        "aac",
        "-b:a",
        `${plano.audioKbps}k`,
        "-movflags",
        "+faststart",
        destino,
      ],
      { maxBuffer: BUFFER }
    );

    await stat(destino);
    const { readFile } = await import("node:fs/promises");
    const arquivo = await readFile(destino);

    return {
      arquivo,
      duracaoOriginal: duracao,
      duracaoFinal: final,
      trechos: trechos.length,
      excedeWhatsApp: plano.excedeWhatsApp,
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
