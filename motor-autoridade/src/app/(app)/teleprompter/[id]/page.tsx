import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { videoSchema } from "@/lib/ai/schemas";
import Teleprompter from "../Teleprompter";

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

  const script = video
    ? [video.hook, video.body, video.cta].map((s) => s.trim()).filter(Boolean).join("\n\n")
    : "";

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
    />
  );
}
