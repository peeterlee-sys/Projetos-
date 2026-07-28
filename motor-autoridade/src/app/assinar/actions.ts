"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { findOrCreateCustomer, createSubscriptionCheckout } from "@/lib/asaas/client";

export type SubscribeResult = { ok: false; error: string };

/** Valida CPF por dígito verificador (algoritmo padrão da Receita Federal). */
function isValidCpf(raw: string): boolean {
  const cpf = raw.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digits = cpf.split("").map(Number);
  for (const base of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < base; i++) sum += digits[i] * (base + 1 - i);
    const rest = (sum * 10) % 11;
    const check = rest === 10 ? 0 : rest;
    if (check !== digits[base]) return false;
  }
  return true;
}

/**
 * Cria (ou reaproveita) o cliente no Asaas, abre a assinatura recorrente e
 * manda o vereador pro checkout deles (Pix, cartão ou boleto). Guardamos os
 * IDs do Asaas no perfil pra o webhook casar o pagamento com a conta certa.
 */
export async function subscribeToPlan(
  plan: "monthly" | "yearly",
  cpf: string
): Promise<SubscribeResult> {
  if (!isValidCpf(cpf)) return { ok: false, error: "CPF inválido." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sessão expirada. Faça login novamente." };

  const { data: me } = await supabase.from("users").select("full_name, email").eq("id", user.id).maybeSingle();
  const { data: profile } = await supabase
    .from("client_profiles")
    .select("phone, political_name")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) return { ok: false, error: "Conclua a anamnese antes de assinar." };

  let customerId: string;
  let checkout: { subscriptionId: string; invoiceUrl: string };
  try {
    const customer = await findOrCreateCustomer({
      name: profile.political_name || me?.full_name || "Vereador",
      cpfCnpj: cpf,
      email: me?.email,
      mobilePhone: profile.phone ?? undefined,
    });
    customerId = customer.id;
    checkout = await createSubscriptionCheckout({
      customerId: customer.id,
      plan,
      externalReference: user.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao gerar o checkout.";
    return { ok: false, error: message };
  }

  await supabase
    .from("client_profiles")
    .update({
      asaas_customer_id: customerId,
      asaas_subscription_id: checkout.subscriptionId,
      plan_cycle: plan,
      subscription_updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  redirect(checkout.invoiceUrl);
}
