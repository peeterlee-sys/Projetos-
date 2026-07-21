/**
 * Rate limiter em memória (best-effort). Simples janela deslizante por chave.
 * Observação: em ambientes serverless com múltiplas instâncias, o estado não é
 * compartilhado — é uma primeira barreira, não um limite global rígido. Para
 * limite forte, migrar para um store compartilhado (ex.: Upstash/Redis).
 */
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false; // limite excedido
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}
