import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { createTask, uploadByUrl, zapcapConfigured } from "@/lib/zapcap/client";
import { EDIT_REQUEST_SYNC_COLUMNS, syncEditRequest } from "@/lib/zapcap/sync";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Edição com legenda (ZapCap), disparada pelo cliente após aprovar o vídeo.
 * POST  { videoUrl, contentItemId? } → cria o pedido e a task no ZapCap.
 * GET   ?requestId=...              → faz o polling e devolve status/output.
 */
export async function POST(request: NextRequest) {
  if (!zapcapConfigured()) {
    return NextResponse.json({ error: "Edição de legenda ainda não configurada." }, { status: 503 });
  }
  const user = await getSessionUser();
  if (!user || !user.tenant_id) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  }

  let payload: { videoUrl: string; contentItemId?: string };
  try {
    payload = z
      .object({ videoUrl: z.string().url(), contentItemId: z.string().uuid().optional() })
      .parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: reqRow, error: insErr } = await supabase
    .from("edit_requests")
    .insert({
      tenant_id: user.tenant_id,
      user_id: user.id,
      content_item_id: payload.contentItemId ?? null,
      provider: "zapcap",
      template_id: process.env.ZAPCAP_TEMPLATE_ID ?? null,
      language: process.env.ZAPCAP_LANGUAGE || "pt",
      source_url: payload.videoUrl,
      status: "processing",
    })
    .select("id")
    .single();
  if (insErr || !reqRow) {
    return NextResponse.json({ error: "Não foi possível registrar o pedido." }, { status: 500 });
  }

  try {
    const videoId = await uploadByUrl(payload.videoUrl);
    const taskId = await createTask(videoId);
    await supabase
      .from("edit_requests")
      .update({ external_video_id: videoId, external_task_id: taskId })
      .eq("id", reqRow.id);
    return NextResponse.json({ request_id: reqRow.id, status: "processing" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao enviar ao ZapCap.";
    await supabase.from("edit_requests").update({ status: "failed", error: message }).eq("id", reqRow.id);
    return NextResponse.json({ request_id: reqRow.id, status: "failed", error: message }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });

  const requestId = request.nextUrl.searchParams.get("requestId") ?? "";
  if (!z.string().uuid().safeParse(requestId).success) {
    return NextResponse.json({ error: "requestId inválido." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("edit_requests")
    .select(EDIT_REQUEST_SYNC_COLUMNS)
    .eq("id", requestId)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });

  const s = await syncEditRequest(supabase, row);
  return NextResponse.json({
    status: s.status,
    output_url: s.outputUrl,
    ...(s.error ? { error: s.error } : {}),
    ...(s.note ? { note: s.note } : {}),
  });
}
