import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdtemp, readFile, rm, stat, statfs } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { getSessionUser } from "@/lib/auth/session";
import { cortarSilencio } from "@/lib/video/executar";

const exec = promisify(execFile);

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Diz o que o ambiente da função realmente tem, em vez de deixar a gente
 * adivinhar por mensagem de erro.
 *
 * Existe porque o mesmo vídeo cortava na máquina de desenvolvimento e falhava
 * publicado: cada tentativa de adivinhar a causa custava um ciclo de deploy e
 * um teste do cliente. Aqui cada passo é verificado e relatado separadamente,
 * inclusive um corte de verdade feito do zero dentro da função.
 *
 * Exige sessão: expõe caminho de arquivo e versão de binário.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });

  const r: Record<string, unknown> = {};

  // 1. O binário veio no pacote da função?
  r.caminho_do_binario = ffmpegPath ?? null;
  if (!ffmpegPath) {
    r.conclusao = "O ffmpeg não foi empacotado nesta função.";
    return NextResponse.json(r);
  }
  try {
    const s = await stat(ffmpegPath);
    r.binario_existe = true;
    r.binario_mb = Number((s.size / 1048576).toFixed(1));
    r.binario_permissao = (s.mode & 0o777).toString(8);
  } catch (e) {
    r.binario_existe = false;
    r.binario_erro = (e as Error).message;
    r.conclusao = "O arquivo do ffmpeg não está no pacote.";
    return NextResponse.json(r);
  }

  // 2. Dá para executar onde ele está, ou precisa da cópia para /tmp?
  try {
    await access(ffmpegPath, constants.X_OK);
    r.executavel_no_lugar = true;
  } catch {
    r.executavel_no_lugar = false;
  }

  // 3. Espaço em /tmp: o binário copiado e o vídeo disputam o mesmo disco.
  try {
    const fs = await statfs(tmpdir());
    r.tmp_livre_mb = Math.round((fs.bsize * fs.bavail) / 1048576);
  } catch {
    r.tmp_livre_mb = null;
  }
  r.memoria_mb = Math.round(process.memoryUsage().rss / 1048576);

  // 4. O ffmpeg sobe e responde?
  const dir = await mkdtemp(join(tmpdir(), "diag-"));
  try {
    try {
      const { stdout } = await exec(ffmpegPath, ["-version"], { maxBuffer: 8 * 1024 * 1024 });
      r.versao = stdout.split("\n")[0];
      r.executou = true;
    } catch (e) {
      const err = e as { code?: string | number; message?: string };
      r.executou = false;
      r.erro_execucao = `${err.code ?? ""} ${err.message ?? ""}`.trim();
      r.conclusao =
        "O binário está no pacote mas não executa — provavelmente falta permissão de execução.";
      return NextResponse.json(r);
    }

    // 5. Corte real, de ponta a ponta, com um vídeo gerado aqui dentro.
    const amostra = join(dir, "amostra.mp4");
    await exec(
      ffmpegPath,
      [
        "-y", "-loglevel", "error",
        "-f", "lavfi", "-i", "testsrc2=size=320x568:rate=15:duration=8",
        "-f", "lavfi", "-i", "sine=frequency=300:duration=8",
        "-filter_complex", "[1:a]volume='if(lt(mod(t,4),2),1,0)':eval=frame[a]",
        "-map", "0:v", "-map", "[a]",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "36",
        "-c:a", "aac", "-t", "8", amostra,
      ],
      { maxBuffer: 32 * 1024 * 1024 }
    );
    const bytes = await readFile(amostra);
    r.amostra_kb = Math.round(bytes.byteLength / 1024);

    const corte = await cortarSilencio(bytes);
    r.corte_funcionou = true;
    r.corte = {
      original: Math.round(corte.duracaoOriginal),
      final: Math.round(corte.duracaoFinal),
      trechos: corte.trechos,
      saida_kb: Math.round(corte.arquivo.byteLength / 1024),
    };
    r.conclusao = "O ffmpeg funciona nesta função. A falha está no vídeo enviado ou no Storage.";
  } catch (e) {
    r.corte_funcionou = false;
    r.erro_corte = (e as Error).message;
    r.conclusao = "O ffmpeg executa, mas o corte falha dentro da função.";
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }

  return NextResponse.json(r);
}
