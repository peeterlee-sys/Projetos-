import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { claimIdempotency, finishExecution, verifyMakeSignature } from "@/lib/make/security";

export const runtime = "nodejs";

const envelopeSchema = z.object({
  action: z.string(),
  idempotency_key: z.string().min(8),
  payload: z.record(z.unknown()).default({}),
});

/**
 * Endpoint único e autenticado para o Make (MÓDULO 14).
 * Segurança: assinatura HMAC + idempotency_key + logs de execução.
 */
export async function POST(request: NextRequest) {
  const started = Date.now();
  const rawBody = await request.text();
  const signature = request.headers.get("x-motor-signature");

  if (!verifyMakeSignature(rawBody, signature)) {
    return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
  }

  let envelope: z.infer<typeof envelopeSchema>;
  try {
    envelope = envelopeSchema.parse(JSON.parse(rawBody));
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { fresh, logId } = await claimIdempotency(
    supabase,
    envelope.idempotency_key,
    envelope.action,
    envelope
  );
  if (!fresh) {
    return NextResponse.json({ status: "duplicate", idempotency_key: envelope.idempotency_key }, { status: 200 });
  }

  try {
    const result = await dispatch(supabase, envelope.action, envelope.payload);
    await finishExecution(supabase, logId, "done", result, Date.now() - started);
    return NextResponse.json({ status: "ok", ...result }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro interno";
    await finishExecution(supabase, logId, "error", { message }, Date.now() - started);
    await supabase.from("system_errors").insert({ scope: "make", message, context: { action: envelope.action } });
    return NextResponse.json({ status: "error", message }, { status: 500 });
  }
}

type Supabase = ReturnType<typeof createServiceClient>;

async function dispatch(supabase: Supabase, action: string, payload: Record<string, unknown>) {
  switch (action) {
    case "deliver_opportunity":
      return deliverOpportunity(supabase, payload);
    case "get_profile":
      return getProfile(supabase, payload);
    case "get_history":
      return getHistory(supabase, payload);
    case "register_error":
      return registerError(supabase, payload);
    default:
      // Ação reconhecida mas ainda não implementada: aceita e registra.
      return { accepted: true, action };
  }
}

async function tenantOf(supabase: Supabase, userId: string): Promise<string> {
  const { data } = await supabase.from("users").select("tenant_id").eq("id", userId).maybeSingle();
  if (!data?.tenant_id) throw new Error("usuário sem tenant");
  return data.tenant_id;
}

async function deliverOpportunity(supabase: Supabase, payload: Record<string, unknown>) {
  const schema = z.object({
    user_id: z.string().uuid(),
    title: z.string(),
    theme: z.string().optional(),
    reason: z.string().optional(),
    editorial_angle: z.string().optional(),
    relevance_score: z.number().min(0).max(1).optional(),
    estimated_duration: z.number().int().optional(),
    recommended_format: z.enum(["video", "carousel", "post", "story", "linkedin"]).default("video"),
    sources: z.array(z.unknown()).optional(),
  });
  const p = schema.parse(payload);
  const tenantId = await tenantOf(supabase, p.user_id);

  const { data: opp, error } = await supabase
    .from("daily_opportunities")
    .insert({
      tenant_id: tenantId,
      user_id: p.user_id,
      title: p.title,
      theme: p.theme ?? null,
      reason: p.reason ?? null,
      editorial_angle: p.editorial_angle ?? null,
      relevance_score: p.relevance_score ?? null,
      estimated_duration: p.estimated_duration ?? null,
      recommended_format: p.recommended_format,
      sources: p.sources ?? [],
      status: "delivered",
    })
    .select("id")
    .single();
  if (error || !opp) throw new Error(error?.message ?? "falha ao criar oportunidade");

  await supabase.from("deliveries").insert({
    tenant_id: tenantId,
    user_id: p.user_id,
    opportunity_id: opp.id,
    channel: "in_app",
  });
  await supabase.from("behavior_events").insert({
    tenant_id: tenantId,
    user_id: p.user_id,
    event_type: "conteudo_entregue",
    metadata: { opportunity_id: opp.id },
  });

  return { opportunity_id: opp.id };
}

async function getProfile(supabase: Supabase, payload: Record<string, unknown>) {
  const { user_id } = z.object({ user_id: z.string().uuid() }).parse(payload);
  const { data } = await supabase
    .from("client_profiles")
    .select("contexto_mestre, display_name, profession, tone_of_voice, main_themes, forbidden_themes")
    .eq("user_id", user_id)
    .maybeSingle();
  return { profile: data ?? null };
}

async function getHistory(supabase: Supabase, payload: Record<string, unknown>) {
  const { user_id, limit } = z
    .object({ user_id: z.string().uuid(), limit: z.number().int().min(1).max(100).default(20) })
    .parse(payload);
  const { data } = await supabase
    .from("content_items")
    .select("id, title, status, published_at, created_at")
    .eq("user_id", user_id)
    .order("created_at", { ascending: false })
    .limit(limit);
  return { history: data ?? [] };
}

async function registerError(supabase: Supabase, payload: Record<string, unknown>) {
  const p = z
    .object({ scope: z.string().default("make"), message: z.string(), context: z.record(z.unknown()).optional() })
    .parse(payload);
  await supabase.from("system_errors").insert({ scope: p.scope, message: p.message, context: p.context ?? {} });
  return { logged: true };
}
