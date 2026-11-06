// Servidor HTTP do worker de edição de vídeo do Porta Voz.
// O painel manda um job (URLs dos vídeos no Blob + opções); o worker baixa,
// edita com ffmpeg/Whisper e devolve a URL do vídeo final.
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { editar } from "./editar.mjs";

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 8080;
const SEGREDO = process.env.WORKER_SECRET || "";
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || "";

// Jobs em memória (suficiente para 1 instância; se escalar, trocar por fila).
const jobs = new Map();
// Pasta local servida quando não há Blob configurado (teste/dev).
const SAIDA_LOCAL = path.join(os.tmpdir(), "pv-saidas");
await fs.mkdir(SAIDA_LOCAL, { recursive: true });
app.use("/saida", express.static(SAIDA_LOCAL));

function autorizado(req) {
  if (!SEGREDO) return true; // sem segredo definido = modo dev
  return req.get("x-worker-secret") === SEGREDO;
}

async function baixar(url, destino) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar ${url} (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(destino, buf);
  return destino;
}

async function publicar(arquivo, id) {
  const buf = await fs.readFile(arquivo);
  if (BLOB_TOKEN) {
    const { put } = await import("@vercel/blob");
    const r = await put(`videos/editado-${id}.mp4`, buf, {
      access: "public", contentType: "video/mp4", token: BLOB_TOKEN, addRandomSuffix: false,
    });
    return r.url;
  }
  // Fallback local (dev): serve pela rota /saida
  const nome = `editado-${id}.mp4`;
  await fs.writeFile(path.join(SAIDA_LOCAL, nome), buf);
  return `/saida/${nome}`;
}

async function processar(id, body) {
  const job = jobs.get(id);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "pv-job-"));
  try {
    job.status = "baixando";
    const inputs = [];
    const urls = Array.isArray(body.videos) ? body.videos : [body.video];
    for (let i = 0; i < urls.length; i++) {
      inputs.push(await baixar(urls[i], path.join(tmp, `in-${i}.mp4`)));
    }
    job.status = "editando";
    const r = await editar({
      inputs,
      modo: body.modo === "takes" ? "takes" : "single",
      cortar: body.cortar !== false,
      legendas: body.legendas !== false,
    }, tmp);
    job.status = "publicando";
    job.url = await publicar(r.arquivo, id);
    job.duracao = r.duracao;
    job.status = "pronto";
  } catch (e) {
    job.status = "erro";
    job.erro = String(e.message || e);
    console.error(`[job ${id}] erro:`, e);
  } finally {
    job.terminadoEm = Date.now();
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

app.get("/", (_req, res) => res.json({ ok: true, servico: "portavoz-video-worker", blob: !!BLOB_TOKEN }));

app.post("/jobs", (req, res) => {
  if (!autorizado(req)) return res.status(401).json({ erro: "nao autorizado" });
  const urls = Array.isArray(req.body.videos) ? req.body.videos : (req.body.video ? [req.body.video] : []);
  if (!urls.length) return res.status(400).json({ erro: "envie videos: [url...]" });
  const id = crypto.randomUUID();
  jobs.set(id, { id, status: "na fila", criadoEm: Date.now() });
  processar(id, req.body); // não aguarda; processa em segundo plano
  res.status(202).json({ id, status: "na fila" });
});

app.get("/jobs/:id", (req, res) => {
  if (!autorizado(req)) return res.status(401).json({ erro: "nao autorizado" });
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ erro: "job nao encontrado" });
  res.json(job);
});

// Limpeza simples: remove jobs terminados há mais de 1h.
setInterval(() => {
  const limite = Date.now() - 3600_000;
  for (const [id, j] of jobs) if (j.terminadoEm && j.terminadoEm < limite) jobs.delete(id);
}, 600_000).unref();

app.listen(PORT, () => console.log(`Porta Voz video-worker ouvindo na porta ${PORT} (blob=${!!BLOB_TOKEN})`));
