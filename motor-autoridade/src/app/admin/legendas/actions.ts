"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { zapcapConfigured } from "@/lib/zapcap/client";
import { EDIT_REQUEST_SYNC_COLUMNS, syncEditRequest } from "@/lib/zapcap/sync";

export type RefreshResult =
  | { ok: false; error: string }
  | { ok: true; checked: number; ready: number; failed: number };

/** Quantos pedidos abertos são reconsultados por clique (limite do serverless). */
const BATCH = 20;

/**
 * Reconsulta no ZapCap os pedidos ainda abertos e persiste o desfecho. Existe
 * porque o polling roda no navegador do cliente: se ele fecha a tela antes do
 * render terminar, o pedido fica preso em "processando" até alguém sincronizar.
 */
export async function refreshEditRequests(): Promise<RefreshResult> {
  const user = await getSessionUser();
  if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
    return { ok: false, error: "Sem permissão." };
  }
  if (!zapcapConfigured()) {
    return { ok: false, error: "ZapCap não configurado neste ambiente." };
  }

  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("edit_requests")
    .select(EDIT_REQUEST_SYNC_COLUMNS)
    .in("status", ["pending", "processing"])
    .not("external_task_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(BATCH);
  if (error) return { ok: false, error: "Não foi possível ler os pedidos." };

  const results = await Promise.all((rows ?? []).map((row) => syncEditRequest(supabase, row)));

  revalidatePath("/admin/legendas");
  return {
    ok: true,
    checked: results.length,
    ready: results.filter((r) => r.status === "ready").length,
    failed: results.filter((r) => r.status === "failed").length,
  };
}
