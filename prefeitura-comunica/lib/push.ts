import "server-only";
import webpush from "web-push";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema";

/** Cria a tabela de inscrições se ainda não existir (evita migração manual). */
export async function ensurePushTable(): Promise<void> {
  await db.run(sql`CREATE TABLE IF NOT EXISTS push_subscriptions (
    id text PRIMARY KEY,
    prefeitura_id text NOT NULL,
    user_id text,
    endpoint text NOT NULL UNIQUE,
    p256dh text NOT NULL,
    auth text NOT NULL,
    criado_em integer NOT NULL DEFAULT (unixepoch())
  )`);
}

/**
 * Web Push (notificações no celular da equipe de comunicação).
 * Usa chaves VAPID (env). O painel manda um "toc" quando chega release novo.
 */

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:contato@portavoz.ia.br",
    pub,
    priv,
  );
  configured = true;
  return true;
}

export function pushDisponivel(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

type Payload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

/**
 * Envia uma notificação para todos os aparelhos inscritos de uma prefeitura.
 * Remove automaticamente as inscrições mortas (404/410).
 */
export async function notifyPrefeitura(
  prefeituraId: string,
  payload: Payload,
): Promise<void> {
  if (!ensureConfigured()) return;
  await ensurePushTable();

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.prefeituraId, prefeituraId));
  if (!subs.length) return;

  const data = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          data,
        );
      } catch (err: unknown) {
        const code = (err as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) {
          await db
            .delete(pushSubscriptions)
            .where(eq(pushSubscriptions.id, s.id));
        } else {
          console.error("[push] falha ao enviar", code, err);
        }
      }
    }),
  );
}

/** Notificação padrão de "chegou release novo". */
export async function notifyNovoRelease(
  prefeituraId: string,
  opts: { secretarioNome?: string | null; secretaria?: string | null; headline?: string | null },
): Promise<void> {
  const quem = opts.secretarioNome?.split(" ")[0] || "Um secretário";
  const onde = opts.secretaria ? ` (${opts.secretaria})` : "";
  await notifyPrefeitura(prefeituraId, {
    title: "📝 Novo release para revisar",
    body: opts.headline
      ? `${quem}${onde}: ${opts.headline}`
      : `${quem}${onde} enviou uma nova matéria.`,
    url: "/app",
    tag: "novo-release",
  });
}
