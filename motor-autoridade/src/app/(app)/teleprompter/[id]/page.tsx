import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { videoSchema } from "@/lib/ai/schemas";
import { zapcapConfigured } from "@/lib/zapcap/client";
import Teleprompter from "../Teleprompter";

/** Normaliza para comparar trechos (caixa, acentos, espaços, pontuação). */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Monta o roteiro falado sem duplicar a abertura. Se o corpo já contém o
 * gancho (a IA às vezes repete a primeira frase), o gancho isolado é omitido.
 */
function buildSpokenScript(hook: string, body: string, cta: string): string {
  const h = hook.trim();
  const b = body.trim();
  const c = cta.trim();
  const parts: string[] = [];
  const hookKey = norm(h).slice(0, 45);
  const bodyRepeatsHook = hookKey.length >= 20 && norm(b).includes(hookKey);
  if (h && !bodyRepeatsHook) parts.push(h);
  if (b) parts.push(b);
  // CTA só entra se não estiver já no fim do corpo.
  if (c && !norm(b).includes(norm(c).slice(0, 30))) parts.push(c);
  return parts.join("\n\n");
}

/**
 * Teleprompter carregado a partir de um conteúdo: lê o formato "video"
 * gerado e monta o roteiro falado (gancho + corpo + CTA). As orientações de
 * gravação ficam à parte, como dica — não entram na rolagem.
 */
export default async function TeleprompterFromContentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  const { data: item } = await supabase
    .from("content_items")
    .select("id, title")
    .eq("id", id)
    .maybeSingle();
  if (!item) notFound();

  const { data: videoFormat } = await supabase
    .from("content_formats")
    .select("payload")
    .eq("content_item_id", id)
    .eq("format", "video")
    .maybeSingle();

  const parsed = videoSchema.safeParse(videoFormat?.payload);
  const video = parsed.success ? parsed.data : null;

  // Só o que é FALADO vai para a rolagem (gancho + corpo + CTA) — nunca título
  // nem orientações. Dedupe: se o corpo já começa com o gancho (a IA às vezes
  // repete a abertura), o gancho não entra duas vezes.
  const script = video ? buildSpokenScript(video.hook, video.body, video.cta) : "";

  return (
    <Teleprompter
      initialScript={script}
      title={item.title}
      recordingTips={video?.recording_tips ?? null}
      durationSec={video?.duration_sec ?? null}
      backHref={`/conteudo/${id}`}
      backLabel="Conteúdo"
      contentItemId={item.id}
      caption={video?.caption ?? null}
      captionsEnabled={zapcapConfigured()}
    />
  );
}
