import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { processarJob } from "@/lib/video/jobs";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Quantos pedidos atender por passada, para não estourar o tempo da função. */
const LOTE = 3;

/**
 * Pedido parado há mais que isto é porque a execução anterior morreu antes de
 * terminar; abaixo disso ela provavelmente ainda está rodando e mexer no mesmo
 * pedido faria o trabalho duas vezes.
 */
const MINUTOS_PARADO = 4;

/**
 * Retoma a edição de vídeo que ficou pelo caminho.
 *
 * O processamento normal acontece em `after()`, logo depois da resposta ao
 * vereador. Mas a função serverless tem teto de tempo, e o render de legenda
 * pode passar dele — sem este cron o pedido ficaria "legendando" para sempre
 * e o vereador voltaria ao app sem o vídeo que prometemos.
 *
 * Protegido por CRON_SECRET, mesmo padrão dos demais crons.
 */
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const provided =
    request.headers.get("x-cron-secret") ??
    bearer ??
    new URL(request.url).searchParams.get("secret");
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const limite = new Date(Date.now() - MINUTOS_PARADO * 60_000).toISOString();

  const { data, error } = await supabase
    .from("video_jobs")
    .select("id")
    .in("status", ["pendente", "cortando", "legendando"])
    .lt("updated_at", limite)
    .order("created_at", { ascending: true })
    .limit(LOTE);

  if (error) {
    await supabase.from("system_errors").insert({
      scope: "cron",
      message: error.message,
      context: { job: "video-pendentes" },
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const pendentes = data ?? [];
  // Em série: cada um usa ffmpeg, e em paralelo disputariam a mesma CPU.
  for (const job of pendentes) {
    await processarJob(supabase, job.id);
  }

  return NextResponse.json({ status: "ok", retomados: pendentes.length });
}

export const GET = handle;
export const POST = handle;
