import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createTask, getTaskStatus, uploadByUrl, zapcapConfigured } from "@/lib/zapcap/client";
import { LIMITE_ENTRADA_MB, cortarSilencio } from "./executar";

/**
 * Processamento da fila de vídeo.
 *
 * Roda fora da requisição que criou o pedido — por `after()` logo depois da
 * resposta, ou pelo cron que recolhe o que ficou pelo caminho. Por isso cada
 * passo grava o estado no banco antes de seguir: se a função for cortada no
 * meio, a próxima passada sabe de onde continuar.
 */

const BUCKET = "recordings";

/** Validade da URL que vai para o ZapCap: o render leva ~1 min, 1h sobra. */
const VALIDADE_URL = 3600;

/** Quanto esperar o ZapCap dentro da mesma execução antes de deixar pro cron. */
const ESPERA_MAX_MS = 150_000;
const INTERVALO_MS = 5_000;

type Cliente = SupabaseClient;

async function marcar(supabase: Cliente, id: string, campos: Record<string, unknown>) {
  await supabase.from("video_jobs").update(campos).eq("id", id);
}

async function falhar(supabase: Cliente, id: string, erro: string) {
  await marcar(supabase, id, { status: "falhou", erro });
  await supabase.from("system_errors").insert({
    scope: "video",
    message: erro,
    context: { job: id },
  });
}

async function urlAssinada(supabase: Cliente, caminho: string): Promise<string> {
  const r = await supabase.storage.from(BUCKET).createSignedUrl(caminho, VALIDADE_URL);
  if (!r.data?.signedUrl) throw new Error("Não foi possível preparar o vídeo.");
  return r.data.signedUrl;
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Leva um pedido do início ao fim, ou até onde der nesta execução.
 *
 * Nunca lança: é chamada de onde ninguém está esperando resposta, então toda
 * falha vira estado no banco — caso contrário o vereador ficaria com um
 * pedido eternamente "processando" e sem explicação.
 */
export async function processarJob(supabase: Cliente, id: string): Promise<void> {
  try {
    const { data: job } = await supabase
      .from("video_jobs")
      .select("id, source_path, output_path, cortar, legendar, status, zapcap_video_id, zapcap_task_id")
      .eq("id", id)
      .maybeSingle();
    if (!job) return;
    if (job.status === "pronto" || job.status === "falhou") return;

    // Já tem render de legenda em andamento: só falta acompanhar.
    if (job.zapcap_video_id && job.zapcap_task_id) {
      await acompanharLegenda(supabase, id, job.zapcap_video_id, job.zapcap_task_id);
      return;
    }

    let caminhoAtual = job.output_path || job.source_path;

    if (job.cortar && !job.output_path) {
      await marcar(supabase, id, { status: "cortando" });

      const baixado = await supabase.storage.from(BUCKET).download(job.source_path);
      if (baixado.error || !baixado.data) {
        await falhar(supabase, id, "O vídeo enviado não foi encontrado no servidor.");
        return;
      }
      const entrada = Buffer.from(await baixado.data.arrayBuffer());
      if (entrada.byteLength > LIMITE_ENTRADA_MB * 1024 * 1024) {
        await falhar(supabase, id, `O vídeo passa de ${LIMITE_ENTRADA_MB}MB e não cabe no processamento.`);
        return;
      }

      const r = await cortarSilencio(entrada);
      const destino = job.source_path.replace(/(\.[^.]+)?$/, "") + "-cortado.mp4";
      const subida = await supabase.storage
        .from(BUCKET)
        .upload(destino, r.arquivo, { contentType: "video/mp4", upsert: true });
      if (subida.error) {
        await falhar(supabase, id, "Não foi possível guardar o vídeo cortado.");
        return;
      }

      caminhoAtual = destino;
      await marcar(supabase, id, {
        output_path: destino,
        duracao_original: Math.round(r.duracaoOriginal),
        duracao_final: Math.round(r.duracaoFinal),
        cortes: r.trechos,
        excede_whatsapp: r.excedeWhatsApp,
      });
    }

    if (!job.legendar || !zapcapConfigured()) {
      await marcar(supabase, id, { status: "pronto", output_path: caminhoAtual });
      return;
    }

    await marcar(supabase, id, { status: "legendando" });
    const videoId = await uploadByUrl(await urlAssinada(supabase, caminhoAtual));
    const taskId = await createTask(videoId);
    await marcar(supabase, id, { zapcap_video_id: videoId, zapcap_task_id: taskId });

    await acompanharLegenda(supabase, id, videoId, taskId);
  } catch (err) {
    await falhar(supabase, id, err instanceof Error ? err.message : "Falha ao editar o vídeo.");
  }
}

/**
 * Espera o render do ZapCap e guarda o vídeo legendado no nosso bucket.
 *
 * Baixar em vez de só apontar para a URL deles é de propósito: o link do
 * provedor expira, e o vereador precisa achar o vídeo semanas depois.
 *
 * Se estourar o tempo desta execução, sai sem marcar erro — o pedido fica em
 * 'legendando' com os ids salvos e o cron retoma daqui.
 */
async function acompanharLegenda(
  supabase: Cliente,
  id: string,
  videoId: string,
  taskId: string
): Promise<void> {
  const limite = Date.now() + ESPERA_MAX_MS;

  while (Date.now() < limite) {
    const s = await getTaskStatus(videoId, taskId);

    if (s.status === "ready" && s.outputUrl) {
      const resp = await fetch(s.outputUrl);
      if (!resp.ok) {
        await falhar(supabase, id, "O vídeo legendado não pôde ser baixado.");
        return;
      }
      const legendado = Buffer.from(await resp.arrayBuffer());
      const destino = `${id}-legendado.mp4`;

      const { data: job } = await supabase
        .from("video_jobs")
        .select("source_path")
        .eq("id", id)
        .maybeSingle();
      const pasta = job?.source_path.split("/")[0] ?? "";
      const caminho = pasta ? `${pasta}/${destino}` : destino;

      const subida = await supabase.storage
        .from(BUCKET)
        .upload(caminho, legendado, { contentType: "video/mp4", upsert: true });
      if (subida.error) {
        await falhar(supabase, id, "Não foi possível guardar o vídeo legendado.");
        return;
      }
      await marcar(supabase, id, { status: "pronto", output_path: caminho });
      return;
    }

    if (s.status === "failed") {
      await falhar(supabase, id, "O provedor não conseguiu gerar as legendas.");
      return;
    }

    await dormir(INTERVALO_MS);
  }
  // Tempo desta execução acabou: fica em 'legendando' e o cron continua.
}
