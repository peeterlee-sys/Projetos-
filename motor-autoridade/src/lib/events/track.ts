import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Tipos de evento comportamental (MÓDULO 7), em linguagem de domínio. */
export const BEHAVIOR_EVENTS = [
  "conteudo_entregue",
  "conteudo_aberto",
  "conteudo_lido",
  "formato_escolhido",
  "teleprompter_aberto",
  "gravacao_iniciada",
  "gravacao_concluida",
  "conteudo_baixado",
  "conteudo_publicado",
  "conteudo_adiado",
  "conteudo_rejeitado",
  "bloqueio_informado",
  "lembrete_solicitado",
  "notificacao_aberta",
] as const;

export type BehaviorEventType = (typeof BEHAVIOR_EVENTS)[number];

export type TrackInput = {
  tenantId: string;
  userId: string;
  eventType: BehaviorEventType;
  contentId?: string | null;
  scriptId?: string | null;
  metadata?: Record<string, unknown>;
};

/** Registra um evento comportamental (respeita RLS via cliente da sessão). */
export async function trackEvent(supabase: SupabaseClient, input: TrackInput): Promise<void> {
  await supabase.from("behavior_events").insert({
    tenant_id: input.tenantId,
    user_id: input.userId,
    content_id: input.contentId ?? null,
    script_id: input.scriptId ?? null,
    event_type: input.eventType,
    metadata: input.metadata ?? {},
  });
}
