import "server-only";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

let configured = false;

/** Configura o VAPID uma vez (Web Push). */
function ensureVapid(): boolean {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:contato@exemplo.com";
  if (!pub || !priv) return false;
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

export type PushPayload = { title: string; body?: string; data?: Record<string, unknown> };

/**
 * Envia uma notificação Web Push para todos os dispositivos ativos do usuário.
 * Remove (desativa) inscrições expiradas (404/410). Requer service client.
 */
export async function sendPushToUser(
  supabase: SupabaseClient,
  userId: string,
  payload: PushPayload
): Promise<{ sent: number }> {
  if (!ensureVapid()) return { sent: 0 };

  const { data: devices } = await supabase
    .from("notification_devices")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId)
    .eq("is_active", true)
    .eq("platform", "web");

  let sent = 0;
  for (const d of devices ?? []) {
    if (!d.p256dh || !d.auth) continue;
    try {
      await webpush.sendNotification(
        { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
        JSON.stringify(payload)
      );
      sent += 1;
      await supabase
        .from("notification_devices")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", d.id);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await supabase.from("notification_devices").update({ is_active: false }).eq("id", d.id);
      }
    }
  }
  return { sent };
}
