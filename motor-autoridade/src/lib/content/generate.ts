import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { generate } from "@/lib/ai";
import { EDITORIAL_SYSTEM, buildFormatPrompt } from "@/lib/ai/prompts";
import { FORMAT_JSON_SCHEMAS, FORMAT_SCHEMAS, type FormatType } from "@/lib/ai/schemas";

type ContentItem = {
  id: string;
  tenant_id: string;
  user_id: string;
  title: string;
  theme: string | null;
};

/**
 * Gera um formato para um content_item usando o contexto_mestre do cliente e
 * persiste em content_formats (payload) + tabela específica quando aplicável.
 * Idempotente por (content_item_id, format) via upsert.
 */
export async function generateAndSaveFormat(
  supabase: SupabaseClient,
  item: ContentItem,
  format: FormatType
): Promise<{ formatId: string }> {
  const [{ data: profile }, { data: prefs }] = await Promise.all([
    supabase
      .from("client_profiles")
      .select("contexto_mestre")
      .eq("user_id", item.user_id)
      .maybeSingle(),
    supabase
      .from("client_preferences")
      .select("video_duration_sec")
      .eq("user_id", item.user_id)
      .maybeSingle(),
  ]);

  const prompt = buildFormatPrompt({
    format,
    contextoMestre: profile?.contexto_mestre ?? {},
    theme: item.theme ?? item.title,
    title: item.title,
    durationSec: prefs?.video_duration_sec ?? 60,
  });

  const payload = await generate<Record<string, unknown>>({
    scenario: "generation",
    system: EDITORIAL_SYSTEM,
    prompt,
    schema: FORMAT_SCHEMAS[format] as unknown as z.ZodType<Record<string, unknown>>,
    jsonSchema: FORMAT_JSON_SCHEMAS[format],
    cost: { tenantId: item.tenant_id, userId: item.user_id, contentId: item.id },
  });

  const caption = "caption" in payload ? (payload.caption as string) : null;
  const cta = "cta" in payload ? (payload.cta as string) : null;

  const { data: fmt, error } = await supabase
    .from("content_formats")
    .upsert(
      {
        tenant_id: item.tenant_id,
        user_id: item.user_id,
        content_item_id: item.id,
        format,
        caption,
        cta,
        payload,
        status: "suggested",
      },
      { onConflict: "content_item_id,format" }
    )
    .select("id")
    .single();

  if (error || !fmt) throw new Error(error?.message ?? "Falha ao salvar formato.");

  // Vídeo: grava também o roteiro em scripts (consumido pelo teleprompter na Fase 4).
  if (format === "video") {
    const v = payload as unknown as import("@/lib/ai/schemas").VideoPayload;
    await supabase
      .from("scripts")
      .insert({
        tenant_id: item.tenant_id,
        user_id: item.user_id,
        content_format_id: fmt.id,
        title: v.title,
        cover_text: v.cover_text,
        hook: v.hook,
        body: v.body,
        cta: v.cta,
        recording_tips: v.recording_tips,
        duration_sec: v.duration_sec,
      });
  }

  return { formatId: fmt.id };
}
