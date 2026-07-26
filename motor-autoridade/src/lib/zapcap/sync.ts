import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTaskStatus } from "./client";

/**
 * Reconciliação de um pedido de legenda com o ZapCap. Usado no polling do
 * cliente (`/api/zapcap`) e no painel administrativo, que precisa fechar
 * pedidos deixados para trás quando o cliente fecha a tela antes do render.
 */

export type EditRequestRow = {
  id: string;
  status: string;
  output_url: string | null;
  external_video_id: string | null;
  external_task_id: string | null;
  error: string | null;
};

export type SyncResult = {
  status: "pending" | "processing" | "ready" | "failed";
  outputUrl: string | null;
  error: string | null;
  /** Falha ao falar com o ZapCap — o pedido segue em processamento. */
  note?: string;
};

/** Colunas mínimas para sincronizar; use no `select` de quem chama. */
export const EDIT_REQUEST_SYNC_COLUMNS =
  "id, status, output_url, external_video_id, external_task_id, error";

export async function syncEditRequest(
  supabase: SupabaseClient,
  row: EditRequestRow,
): Promise<SyncResult> {
  // Estados finais: nada a consultar.
  if (row.status === "ready" || row.status === "failed") {
    return {
      status: row.status,
      outputUrl: row.output_url,
      error: row.error,
    };
  }

  // Sem ids do provedor o pedido nunca chegou a sair daqui.
  if (!row.external_video_id || !row.external_task_id) {
    return { status: row.status === "pending" ? "pending" : "processing", outputUrl: null, error: null };
  }

  try {
    const s = await getTaskStatus(row.external_video_id, row.external_task_id);

    if (s.status === "ready" && s.outputUrl) {
      await supabase
        .from("edit_requests")
        .update({ status: "ready", output_url: s.outputUrl })
        .eq("id", row.id);
      return { status: "ready", outputUrl: s.outputUrl, error: null };
    }

    if (s.status === "failed") {
      const message = s.raw || "render falhou";
      await supabase
        .from("edit_requests")
        .update({ status: "failed", error: message })
        .eq("id", row.id);
      return { status: "failed", outputUrl: null, error: message };
    }

    return { status: "processing", outputUrl: null, error: null };
  } catch (err) {
    const note = err instanceof Error ? err.message : "Falha ao consultar o ZapCap.";
    return { status: "processing", outputUrl: null, error: null, note };
  }
}
