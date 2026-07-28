import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ACTIVE_EVENTS = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);
const PAST_DUE_EVENTS = new Set(["PAYMENT_OVERDUE", "PAYMENT_DELETED", "PAYMENT_REFUNDED"]);

const payloadSchema = z.object({
  event: z.string(),
  payment: z.object({
    subscription: z.string().nullable().optional(),
    customer: z.string().optional(),
  }),
});

/**
 * Webhook do Asaas: mantém subscription_status em dia conforme o pagamento
 * da assinatura muda. Autenticado pelo header que o próprio Asaas devolve,
 * configurado com o token gerado em ASAAS_WEBHOOK_TOKEN.
 */
export async function POST(request: NextRequest) {
  const token = request.headers.get("asaas-access-token");
  if (!token || token !== process.env.ASAAS_WEBHOOK_TOKEN) {
    return NextResponse.json({ error: "token inválido" }, { status: 401 });
  }

  let payload: z.infer<typeof payloadSchema>;
  try {
    payload = payloadSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  let status: "active" | "past_due" | null = null;
  if (ACTIVE_EVENTS.has(payload.event)) status = "active";
  else if (PAST_DUE_EVENTS.has(payload.event)) status = "past_due";
  if (!status) return NextResponse.json({ status: "ignored", event: payload.event });

  const supabase = createServiceClient();
  let query = supabase
    .from("client_profiles")
    .update(
      { subscription_status: status, subscription_updated_at: new Date().toISOString() },
      { count: "exact" }
    );
  query = payload.payment.subscription
    ? query.eq("asaas_subscription_id", payload.payment.subscription)
    : query.eq("asaas_customer_id", payload.payment.customer ?? "");
  const { error, count } = await query.select("user_id");

  if (error) {
    await supabase.from("system_errors").insert({
      scope: "asaas",
      message: error.message,
      context: { event: payload.event, payment: payload.payment },
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: "ok", matched: count ?? 0 });
}
