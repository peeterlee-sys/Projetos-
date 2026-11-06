// Motor de edição de vídeo do Porta Voz (ffmpeg + Whisper).
// Funções: juntar takes, cortar respiros (silêncios) e legendar (queimar).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const run = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";

async function duracao(file) {
  const { stdout } = await run(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]);
  return parseFloat(stdout.trim()) || 0;
}

/** Junta vários takes num vídeo só (normaliza para 1080x1920 vertical). */
export async function juntarTakes(inputs, output) {
  if (inputs.length === 1) { await fs.copyFile(inputs[0], output); return output; }
  const args = [];
  inputs.forEach((f) => args.push("-i", f));
  const parts = inputs.map((_, i) =>
    `[${i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${i}];[${i}:a]aresample=48000[a${i}]`
  );
  const concatIn = inputs.map((_, i) => `[v${i}][a${i}]`).join("");
  const fc = `${parts.join(";")};${concatIn}concat=n=${inputs.length}:v=1:a=1[v][a]`;
  args.push("-filter_complex", fc, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-y", output);
  await run(FFMPEG, args, { maxBuffer: 1 << 26 });
  return output;
}

/** Detecta os silêncios do áudio. Retorna [{start,end}]. */
async function detectarSilencios(file, threshold, minSil) {
  let stderr = "";
  try {
    await run(FFMPEG, ["-i", file, "-af", `silencedetect=noise=${threshold}:d=${minSil}`, "-f", "null", "-"], { maxBuffer: 1 << 26 });
  } catch (e) { stderr = String(e.stderr || ""); }
  // Em sucesso o ffmpeg ainda escreve no stderr; capturamos de qualquer forma.
  if (!stderr) { try { const r = await run(FFMPEG, ["-i", file, "-af", `silencedetect=noise=${threshold}:d=${minSil}`, "-f", "null", "-"], { maxBuffer: 1 << 26 }); stderr = r.stderr || ""; } catch (e) { stderr = String(e.stderr || ""); } }
  const sil = [];
  let start = null;
  for (const linha of stderr.split("\n")) {
    const ms = linha.match(/silence_start:\s*([\d.]+)/);
    const me = linha.match(/silence_end:\s*([\d.]+)/);
    if (ms) start = parseFloat(ms[1]);
    if (me && start != null) { sil.push({ start, end: parseFloat(me[1]) }); start = null; }
  }
  return sil;
}

/** Corta os respiros/silêncios, re-sincronizando vídeo e áudio. */
export async function cortarRespiros(input, output, opts = {}) {
  const threshold = opts.threshold || "-35dB";
  const minSil = opts.minSil ?? 0.45;   // só corta pausas acima disso
  const folga = opts.folga ?? 0.12;     // mantém um respiro curto pra não cortar seco
  const sil = await detectarSilencios(input, threshold, minSil);
  const cortes = sil
    .map((s) => ({ a: s.start + folga, b: s.end - folga }))
    .filter((c) => c.b - c.a > 0.05);
  if (cortes.length === 0) { await fs.copyFile(input, output); return { output, cortes: 0 }; }
  const expr = cortes.map((c) => `between(t,${c.a.toFixed(3)},${c.b.toFixed(3)})`).join("+");
  await run(FFMPEG, [
    "-i", input,
    "-vf", `select='not(${expr})',setpts=N/FRAME_RATE/TB`,
    "-af", `aselect='not(${expr})',asetpts=N/SR/TB`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-y", output,
  ], { maxBuffer: 1 << 26 });
  return { output, cortes: cortes.length };
}

function tempoAss(seg) {
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = Math.floor(seg % 60);
  const cs = Math.floor((seg - Math.floor(seg)) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

/** Quebra o texto em no máx. ~24 caracteres por linha (bom para vertical). */
function quebrar(texto, max = 24) {
  const palavras = texto.trim().split(/\s+/);
  const linhas = [];
  let atual = "";
  for (const p of palavras) {
    if ((atual + " " + p).trim().length > max) { if (atual) linhas.push(atual); atual = p; }
    else atual = (atual + " " + p).trim();
  }
  if (atual) linhas.push(atual);
  return linhas.slice(0, 2).join("\\N");
}

/** Gera o arquivo .ass (legenda estilo Reels) a partir dos segmentos do Whisper. */
export function gerarAss(segmentos) {
  const head = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Outline, Shadow, Alignment, MarginL, MarginR, MarginV
Style: Reels,DejaVu Sans,76,&H00FFFFFF,&H00202020,&H00000000,1,6,0,2,80,80,260

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const linhas = segmentos.map((s) =>
    `Dialogue: 0,${tempoAss(s.start)},${tempoAss(s.end)},Reels,,0,0,0,,${quebrar(s.text)}`
  );
  return head + linhas.join("\n") + "\n";
}

/** Queima a legenda no vídeo. */
export async function legendar(input, assPath, output) {
  const esc = assPath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
  await run(FFMPEG, ["-i", input, "-vf", `subtitles='${esc}'`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "copy", "-y", output], { maxBuffer: 1 << 26 });
  return output;
}

/** Transcreve o áudio do vídeo com o Whisper (segmentos com tempo). */
export async function transcrever(input) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY não configurada no worker");
  const form = new FormData();
  const buf = await fs.readFile(input);
  form.append("file", new Blob([buf]), path.basename(input));
  form.append("model", "whisper-1");
  form.append("language", "pt");
  form.append("response_format", "verbose_json");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form,
  });
  if (!res.ok) throw new Error(`Whisper falhou (${res.status}): ${await res.text()}`);
  const j = await res.json();
  return (j.segments || []).map((s) => ({ start: s.start, end: s.end, text: s.text }));
}

/**
 * Pipeline completo. modo: "single" | "takes".
 * opcoes: { cortar: bool, legendas: bool }
 */
export async function editar({ inputs, modo = "single", cortar = true, legendas = true }, outDir) {
  const tmp = outDir || (await fs.mkdtemp(path.join(os.tmpdir(), "pv-video-")));
  let atual = path.join(tmp, "01-origem.mp4");
  if (modo === "takes" && inputs.length > 1) await juntarTakes(inputs, atual);
  else await fs.copyFile(inputs[0], atual);

  if (cortar) {
    const cortado = path.join(tmp, "02-cortado.mp4");
    await cortarRespiros(atual, cortado);
    atual = cortado;
  }
  if (legendas) {
    const segs = await transcrever(atual);
    if (segs.length) {
      const ass = path.join(tmp, "legenda.ass");
      await fs.writeFile(ass, gerarAss(segs));
      const final = path.join(tmp, "03-legendado.mp4");
      await legendar(atual, ass, final);
      atual = final;
    }
  }
  const saida = path.join(tmp, "final.mp4");
  if (atual !== saida) await fs.copyFile(atual, saida);
  return { arquivo: saida, duracao: await duracao(saida) };
}

// Uso direto na linha de comando (teste): node editar.mjs <saida> <in1> [in2...]
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , saida, ...ins] = process.argv;
  const modo = ins.length > 1 ? "takes" : "single";
  // No teste local sem OPENAI_API_KEY, pula a legenda.
  editar({ inputs: ins, modo, cortar: true, legendas: !!process.env.OPENAI_API_KEY }, path.dirname(saida))
    .then((r) => { console.log("OK:", r); createReadStream(r.arquivo); })
    .catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
}
