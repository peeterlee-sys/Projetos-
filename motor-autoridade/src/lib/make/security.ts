import "server-only";
import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Verifica a assinatura HMAC-SHA256 do webhook do Make.
 * O Make deve enviar o header `x-motor-signature: sha256=<hex>` calculado sobre
 * o corpo bruto com o segredo compartilhado MAKE_WEBHOOK_SECRET.
 */
export function verifyMakeSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.MAKE_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signature.replace(/^sha256=/, "");

  // Comparação em tempo constante.
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

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
