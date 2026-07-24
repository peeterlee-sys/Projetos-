"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { generateAndSaveFormat } from "@/lib/content/generate";
import { trackEvent } from "@/lib/events/track";
import { FORMATS, type FormatType } from "@/lib/ai/schemas";

export type ActionResult = { ok: false; error: string } | { ok: true };

async function loadItem(itemId: string) {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: item } = await supabase
    .from("content_items")
    .select("id, tenant_id, user_id, title, theme")
    .eq("id", itemId)
    .maybeSingle();
  return { user, supabase, item };
}

/** Gera (ou regenera) um formato para o conteúdo. */
export async function generateFormatAction(itemId: string, format: string): Promise<ActionResult> {
  if (!FORMATS.includes(format as FormatType)) return { ok: false, error: "Formato inválido." };
  const { supabase, item } = await loadItem(itemId);
  if (!item) return { ok: false, error: "Conteúdo não encontrado." };

  try {
    await generateAndSaveFormat(supabase, item, format as FormatType);
    await trackEvent(supabase, {
      tenantId: item.tenant_id,
      userId: item.user_id,
      contentId: item.id,
      eventType: "formato_escolhido",
      metadata: { format },
    });
    revalidatePath(`/conteudo/${itemId}`);
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha ao gerar o formato.";
    // Loga com cliente de serviço (a RLS de system_errors é só admin).
    try {
      const admin = createServiceClient();
      await admin.from("system_errors").insert({
        tenant_id: item.tenant_id,
        scope: "ai",
        message,
        context: { item_id: itemId, format },
      });
    } catch {
      // não deixa a falha de log derrubar a resposta
    }
    return { ok: false, error: `Não foi possível gerar agora. [debug: ${message}]` };
  }
}

/** Marca o conteúdo como publicado (métrica principal). */
export async function markPublishedAction(itemId: string): Promise<ActionResult> {
  const { supabase, item } = await loadItem(itemId);
  if (!item) return { ok: false, error: "Conteúdo não encontrado." };

  await supabase
    .from("content_items")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", itemId);
  await trackEvent(supabase, {
    tenantId: item.tenant_id,
    userId: item.user_id,
    contentId: item.id,
    eventType: "conteudo_publicado",
  });
  revalidatePath(`/conteudo/${itemId}`);
  return { ok: true };
}
