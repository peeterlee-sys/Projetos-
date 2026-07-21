import crypto from "crypto";

/**
 * Verifica a assinatura HMAC-SHA256 do webhook do Make (módulo puro, testável).
 * O Make envia `x-motor-signature: sha256=<hex>` sobre o corpo bruto, com o
 * segredo compartilhado MAKE_WEBHOOK_SECRET.
 */
export function verifyMakeSignature(
  rawBody: string,
  signature: string | null,
  secret = process.env.MAKE_WEBHOOK_SECRET
): boolean {
  if (!secret || !signature) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signature.replace(/^sha256=/, "");

  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
