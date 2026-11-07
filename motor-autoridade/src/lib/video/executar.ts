import "server-only";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, chmod, copyFile, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
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

/** Resolvido uma vez por contêiner; a cópia para /tmp é cara para repetir. */
let caminhoDoBinario: string | null = null;

/**
 * Devolve um ffmpeg que realmente dá para executar.
 *
 * O empacotamento da função serverless costuma perder o bit de execução do
 * binário, e aí o `execFile` falha com EACCES antes de ler um único quadro.
 * O diretório da função é somente leitura, então não dá para corrigir no
 * lugar: a saída é copiar para /tmp, que é gravável, e dar permissão lá.
 *
 * Só copia quando precisa — em máquina de desenvolvimento o binário já vem
 * executável e o caminho original serve.
 */
async function binario(): Promise<string> {
  if (caminhoDoBinario) return caminhoDoBinario;
  if (!ffmpegPath) {
    throw new Error("O ffmpeg não foi empacotado nesta função (veja outputFileTracingIncludes).");
  }

  try {
    await access(ffmpegPath, constants.X_OK);
    caminhoDoBinario = ffmpegPath;
    return caminhoDoBinario;
  } catch {
    // Sem permissão de execução: segue para a cópia.
  }

  const destino = join(tmpdir(), "ffmpeg-bin");
  try {
    await access(destino, constants.X_OK);
  } catch {
    await copyFile(ffmpegPath, destino);
    await chmod(destino, 0o755);
  }
  caminhoDoBinario = destino;
  return destino;
}

/**
 * Roda o ffmpeg e devolve o stderr, que é onde ele escreve tudo que interessa
 * — inclusive em sucesso. Com `-f null -` ele ainda sai com código diferente
 * de zero, então o stderr é lido nos dois casos.
 *
 * Falha de execução e falha de vídeo precisam ser distinguidas: quando o
 * processo nem sobe (EACCES, ENOENT) o `code` vem como texto e não há stderr
 * nenhum. Tratar isso como "vídeo ilegível" manda o vereador trocar o arquivo
 * por causa de um problema que é de ambiente e não tem nada a ver com ele.
 */
async function stderrDe(args: string[]): Promise<string> {
  const bin = await binario();
  try {
    const { stderr } = await exec(bin, args, { maxBuffer: BUFFER });
    return stderr;
  } catch (err) {
    const e = err as { stderr?: string; code?: string | number; message?: string };
    if (typeof e.code === "string") {
      throw new Error(`Não foi possível executar o ffmpeg no servidor (${e.code}).`);
    }
    if (typeof e.stderr === "string" && e.stderr.trim()) return e.stderr;
    throw new Error(e.message || "O ffmpeg falhou sem informar o motivo.");
  }
}

/** Últimas linhas do ffmpeg, para a falha chegar diagnosticável ao log. */
function cauda(saida: string, linhas = 4): string {
  return saida.trim().split("\n").slice(-linhas).join(" | ").slice(0, 300);
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

    // Passada 1: análise. Só precisamos do áudio para achar os silêncios, e
    // `-vn` antes do `-i` faz o ffmpeg ignorar o vídeo em vez de decodificá-lo
    // à toa — num 4K isso mediu 10s contra 58ms, uma decodificação inteira de
    // 4K economizada. A linha `Duration:` continua saindo normalmente.
    const analise = await stderrDe([
      "-hide_banner",
      "-vn",
      "-i",
      origem,
      "-af",
      `silencedetect=noise=${RUIDO_PADRAO}:d=${MIN_SILENCIO_PADRAO}`,
      "-f",
      "null",
      "-",
    ]);

    const duracao = parsearDuracao(analise);
    if (!duracao) {
      // Carrega o que o ffmpeg disse: sem isso a falha vira adivinhação, e o
      // formato do celular leva a culpa por qualquer problema de servidor.
      throw new Error(`Não foi possível ler o vídeo. ffmpeg: ${cauda(analise) || "sem saída"}`);
    }

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
      await binario(),
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
