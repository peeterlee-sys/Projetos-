"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { sendPushToUser } from "@/lib/push/send";

export type AdminActionResult = { ok: false; error: string } | { ok: true; sent: number };

async function assertAdmin() {
  const user = await getSessionUser();
  if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
    throw new Error("Sem permissão.");
  }
  return user;
}

/**
 * Envio pontual de push motivacional pra um vereador (ou o assessor, na mesma
 * conta) — usado quando o WhatsApp custaria dinheiro pra avisar "use o app".
 * A RLS de notification_devices já garante que o admin só alcança clientes do
 * próprio tenant (ou qualquer um, se super_admin).
 */
export async function sendMotivationalPush(raw: unknown): Promise<AdminActionResult> {
  await assertAdmin();
  const { userId, message } = z
    .object({ userId: z.string().uuid(), message: z.string().trim().min(1).max(300) })
    .parse(raw);

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();
  if (!target?.tenant_id) return { ok: false, error: "Vereador não encontrado." };

  const payload = { title: "Assessor 24h", body: message, data: { url: "/hoje" } };
  const { sent } = await sendPushToUser(supabase, userId, payload);

  await supabase.from("notifications").insert({
    tenant_id: target.tenant_id,
    user_id: userId,
    type: "reminder",
    title: payload.title,
    body: payload.body,
    channel: "web_push",
    data: payload.data,
    sent_at: sent > 0 ? new Date().toISOString() : null,
  });

  revalidatePath(`/admin/clientes/${userId}`);
  if (sent === 0) return { ok: false, error: "Nenhum dispositivo com push ativado pra esse vereador." };
  return { ok: true, sent };
}
