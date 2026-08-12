"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { sendPushToUser } from "@/lib/push/send";
import { brand } from "@/lib/brand";
import { normalizePhoneBR, phoneVariants, formatPhoneBR } from "@/lib/phone";

export type AdminActionResult = { ok: false; error: string } | { ok: true; sent: number };
export type EdicaoResult = { ok: false; error: string } | { ok: true; aviso?: string };

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

  const payload = { title: "Assessor 24h", body: message, data: { url: brand.home } };
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

const mandatoSchema = z.object({
  userId: z.string().uuid(),
  // Vazio libera o número: o índice único ignora nulo, e é assim que se
  // transfere um telefone de um mandato para outro sem esbarrar nele.
  phone: z.string().trim().max(30),
  politicalName: z.string().trim().max(120),
  city: z.string().trim().max(80),
  state: z.string().trim().max(2),
  party: z.string().trim().max(40),
});

/**
 * Edição dos dados do mandato pelo painel — principalmente o WhatsApp, que é a
 * chave de reconhecimento do assistente e mudava só por SQL até agora.
 *
 * O telefone é normalizado antes de gravar (o get_vereador busca na forma
 * canônica) e o conflito com outro perfil é checado antes, para o admin ver de
 * quem é o número em vez de um erro de constraint do banco.
 */
export async function atualizarMandato(raw: unknown): Promise<EdicaoResult> {
  await assertAdmin();
  const p = mandatoSchema.parse(raw);
  const supabase = await createClient();

  let phone: string | null = null;
  if (p.phone) {
    phone = normalizePhoneBR(p.phone);
    if (!phone) {
      return { ok: false, error: "Telefone inválido. Use DDD + número — ex.: (48) 99992-7518." };
    }

    const { data: donos } = await supabase
      .from("client_profiles")
      .select("user_id, political_name")
      .in("phone", phoneVariants(phone))
      .neq("user_id", p.userId)
      .limit(1);

    const dono = (donos ?? [])[0];
    if (dono) {
      return {
        ok: false,
        error:
          `${formatPhoneBR(phone)} já está no perfil de ${dono.political_name ?? "outro vereador"}. ` +
          "Abra o perfil dele, apague o telefone e salve — aí o número fica livre para este mandato.",
      };
    }
  }

  const { error } = await supabase
    .from("client_profiles")
    .update({
      phone,
      political_name: p.politicalName || null,
      city: p.city || null,
      state: p.state ? p.state.toUpperCase() : null,
      party: p.party || null,
    })
    .eq("user_id", p.userId);

  if (error) {
    // Rede de proteção: outro admin pode ter gravado o mesmo número entre a
    // checagem acima e este update.
    if (error.code === "23505") {
      return { ok: false, error: "Esse telefone acabou de ser usado em outro perfil. Recarregue e tente de novo." };
    }
    return { ok: false, error: "Não foi possível salvar. Tente novamente." };
  }

  revalidatePath(`/admin/clientes/${p.userId}`);
  revalidatePath("/admin");
  revalidatePath("/admin/vereadores");

  return {
    ok: true,
    aviso: phone
      ? undefined
      : "Salvo sem telefone: o assistente não vai reconhecer este mandato no WhatsApp até você cadastrar um número.",
  };
}
