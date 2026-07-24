import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export { verifyMakeSignature, verifyMakeSecret } from "./signature";

/**
 * Controle de idempotência: registra a chave em execution_logs (índice único).
 * Retorna false se a chave já foi processada (duplicata).
 */
export async function claimIdempotency(
  supabase: SupabaseClient,
  key: string,
  operation: string,
  request: unknown
): Promise<{ fresh: boolean; logId: string | null }> {
  const { data, error } = await supabase
    .from("execution_logs")
    .insert({
      source: "make",
      operation,
      idempotency_key: key,
      request,
      status: "processing",
    })
    .select("id")
    .single();

  // Violação de unique => duplicata.
  if (error) {
    if (error.code === "23505") return { fresh: false, logId: null };
    throw new Error(error.message);
  }
  return { fresh: true, logId: data?.id ?? null };
}

/** Finaliza o log de execução com status e resposta. */
export async function finishExecution(
  supabase: SupabaseClient,
  logId: string | null,
  status: "done" | "error",
  response: unknown,
  durationMs?: number
): Promise<void> {
  if (!logId) return;
  await supabase
    .from("execution_logs")
    .update({ status, response, duration_ms: durationMs ?? null })
    .eq("id", logId);
}
