import "server-only";

/**
 * Cliente da API do ZapCap (legendas queimadas no vídeo). A chave fica só no
 * servidor. Fluxo: upload por URL → cria task com template → polling do status.
 * Docs: https://platform.zapcap.ai/docs/
 *
 * Config por ambiente:
 * - ZAPCAP_API_KEY     (obrigatória)
 * - ZAPCAP_TEMPLATE_ID (obrigatória — id do template de legenda escolhido)
 * - ZAPCAP_BASE_URL    (opcional, default https://api.zapcap.ai)
 * - ZAPCAP_LANGUAGE    (opcional, default pt)
 */

const BASE = process.env.ZAPCAP_BASE_URL || "https://api.zapcap.ai";

export function zapcapConfigured(): boolean {
  return Boolean(process.env.ZAPCAP_API_KEY && process.env.ZAPCAP_TEMPLATE_ID);
}

function headers(): Record<string, string> {
  const key = process.env.ZAPCAP_API_KEY;
  if (!key) throw new Error("ZAPCAP_API_KEY não configurada.");
  return { "x-api-key": key, "Content-Type": "application/json" };
}

/** Extrai um campo string de um objeto tentando várias chaves conhecidas. */
function pick(obj: unknown, keys: string[]): string | null {
  if (!obj || typeof obj !== "object") return null;
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string" && v) return v;
  }
  return null;
}

async function req(path: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: headers() });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg = pick(body, ["message", "error"]) || `ZapCap ${res.status}`;
    throw new Error(msg);
  }
  return body;
}

/** Envia o vídeo por URL. Retorna o videoId do ZapCap. */
export async function uploadByUrl(url: string): Promise<string> {
  const body = await req("/videos/url", { method: "POST", body: JSON.stringify({ url }) });
  const id = pick(body, ["id", "videoId"]);
  if (!id) throw new Error("ZapCap não retornou o id do vídeo.");
  return id;
}

/** Cria a task de legenda com o template configurado. Retorna o taskId. */
export async function createTask(videoId: string): Promise<string> {
  const payload = {
    templateId: process.env.ZAPCAP_TEMPLATE_ID,
    autoApprove: true,
    language: process.env.ZAPCAP_LANGUAGE || "pt",
  };
  const body = await req(`/videos/${videoId}/task`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const id = pick(body, ["taskId", "id"]);
  if (!id) throw new Error("ZapCap não retornou o id da task.");
  return id;
}

export type ZapcapStatus = {
  status: "processing" | "ready" | "failed";
  outputUrl: string | null;
  raw: string;
};

/** Consulta o status da task. Normaliza para processing | ready | failed. */
export async function getTaskStatus(videoId: string, taskId: string): Promise<ZapcapStatus> {
  const body = await req(`/videos/${videoId}/task/${taskId}`, { method: "GET" });
  const raw = (pick(body, ["status"]) || "").toLowerCase();
  const outputUrl = pick(body, ["downloadUrl", "renderUrl", "url"]);
  let status: ZapcapStatus["status"] = "processing";
  if (raw === "completed" || raw === "ready" || raw === "done" || (outputUrl && raw !== "failed")) {
    status = "ready";
  } else if (raw === "failed" || raw === "error") {
    status = "failed";
  }
  return { status, outputUrl: status === "ready" ? outputUrl : null, raw };
}
