import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { claimIdempotency, finishExecution, verifyMakeSignature, verifyMakeSecret } from "@/lib/make/security";
import { rateLimit } from "@/lib/rate-limit";

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

  // Rate limit por origem (best-effort): 60 req/min.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`make:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: "muitas requisições" }, { status: 429 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-motor-signature");
  const sharedSecret = request.headers.get("x-motor-secret");

  // Autentica por HMAC (x-motor-signature) OU segredo compartilhado (x-motor-secret).
  if (!verifyMakeSignature(rawBody, signature) && !verifyMakeSecret(sharedSecret)) {
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
    case "get_briefing":
      return getBriefing(supabase, payload);
    case "get_sources":
      return getSources(supabase, payload);
    case "get_history":
      return getHistory(supabase, payload);
    case "list_clients":
      return listClients(supabase, payload);
    case "register_error":
      return registerError(supabase, payload);
    default:
      // Ação reconhecida mas ainda não implementada: aceita e registra.
      return { accepted: true, action };
  }
}

/**
 * Lista clientes ativos para o Make percorrer (fonte única = banco do app).
 * Retorna id + um contexto editorial curto (temas + tom) para personalizar a pauta.
 * Opcional: filtrar por tenant_id.
 */
async function listClients(supabase: Supabase, payload: Record<string, unknown>) {
  const { tenant_id } = z
    .object({ tenant_id: z.string().uuid().optional() })
    .parse(payload);

  // Recebe conteúdo quem concluiu a anamnese — inclusive admins/super_admins
  // que dogfoodam o próprio produto (não só quem tem papel 'client').
  let query = supabase
    .from("users")
    .select(
      "id, full_name, tenant_id, client_profiles(main_themes, tone_of_voice, target_audience, segment, positioning_recognition, editorial_dna)"
    )
    .in("role", ["client", "admin", "super_admin"])
    .eq("is_active", true)
    .is("deleted_at", null)
    .not("onboarded_at", "is", null)
    .limit(500);
  if (tenant_id) query = query.eq("tenant_id", tenant_id);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  // Pautas recentes (14 dias) de todos os clientes, para a IA não repetir
  // ninguém — nem o próprio cliente, nem os demais (Regra nº 1).
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data: recentOpps } = await supabase
    .from("daily_opportunities")
    .select("user_id, title")
    .gte("created_at", since)
    .limit(2000);
  const recentByUser = new Map<string, string[]>();
  for (const o of recentOpps ?? []) {
    const list = recentByUser.get(o.user_id) ?? [];
    if (list.length < 10) list.push(o.title as string);
    recentByUser.set(o.user_id, list);
  }

  const clients = (data ?? []).map((u) => {
    const p = Array.isArray(u.client_profiles) ? u.client_profiles[0] : u.client_profiles;
    const themes = (p?.main_themes ?? []) as string[];
    const dna = (p?.editorial_dna ?? {}) as Record<string, unknown>;
    const context = [
      themes.length ? `Pilares: ${themes.join(", ")}.` : "",
      p?.tone_of_voice ? `Tom: ${p.tone_of_voice}.` : "",
      p?.target_audience ? `Público: ${p.target_audience}.` : "",
      p?.positioning_recognition ? `Posicionamento: ${p.positioning_recognition}.` : "",
      typeof dna.angulo_unico === "string" && dna.angulo_unico
        ? `Ângulo único deste cliente: ${dna.angulo_unico}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    return {
      user_id: u.id,
      name: u.full_name,
      segment: p?.segment ?? null,
      context,
      recent_titles: recentByUser.get(u.id) ?? [],
    };
  });

  return { clients };
}

/**
 * Briefing completo de um cliente para o radar: DNA Editorial, contexto,
 * fontes priorizadas (cliente > segmento), referências e pautas recentes.
 * É o insumo ideal para a IA do Make gerar uma pauta exclusiva.
 */
async function getBriefing(supabase: Supabase, payload: Record<string, unknown>) {
  const { user_id } = z.object({ user_id: z.string().uuid() }).parse(payload);

  const [{ data: profile }, sources, { data: refs }, { data: recent }] = await Promise.all([
    supabase
      .from("client_profiles")
      .select("contexto_mestre, editorial_dna, segment, forbidden_themes")
      .eq("user_id", user_id)
      .maybeSingle(),
    getSources(supabase, { user_id }),
    supabase
      .from("inspiration_refs")
      .select("kind, url, name, style_analysis")
      .eq("user_id", user_id)
      .limit(10),
    supabase
      .from("daily_opportunities")
      .select("title, theme, editorial_angle, opportunity_date")
      .eq("user_id", user_id)
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  return {
    briefing: {
      editorial_dna: profile?.editorial_dna ?? {},
      contexto_mestre: profile?.contexto_mestre ?? {},
      segment: profile?.segment ?? null,
      forbidden_themes: profile?.forbidden_themes ?? [],
      sources: sources.sources,
      blocked_sources: sources.blocked,
      inspiration_refs: refs ?? [],
      recent_opportunities: recent ?? [],
    },
  };
}

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

/**
 * Fontes na ordem certa de consulta: as escolhidas pelo cliente (alta > média
 * > baixa) vêm ANTES da matriz do segmento. Fontes bloqueadas ficam à parte
 * e nunca devem ser consultadas.
 */
async function getSources(supabase: Supabase, payload: Record<string, unknown>) {
  const { user_id } = z.object({ user_id: z.string().uuid() }).parse(payload);

  const [{ data: profile }, { data: own }] = await Promise.all([
    supabase.from("client_profiles").select("segment").eq("user_id", user_id).maybeSingle(),
    supabase
      .from("influence_sources")
      .select("kind, label, url, priority, is_blocked")
      .eq("user_id", user_id)
      .limit(100),
  ]);

  const { data: segmentSources } = profile?.segment
    ? await supabase
        .from("segment_sources")
        .select("name, url, kind, priority")
        .eq("segment", profile.segment)
        .eq("is_active", true)
        .limit(50)
    : { data: [] as { name: string; url: string | null; kind: string; priority: string }[] };

  const blocked = (own ?? []).filter((s) => s.is_blocked).map((s) => s.label ?? s.url ?? "");
  const clientSources = (own ?? [])
    .filter((s) => !s.is_blocked)
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1))
    .map((s) => ({ origin: "client", kind: s.kind, name: s.label, url: s.url, priority: s.priority }));
  const matrixSources = (segmentSources ?? [])
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1))
    .map((s) => ({ origin: "segment", kind: s.kind, name: s.name, url: s.url, priority: s.priority }));

  return { sources: [...clientSources, ...matrixSources], blocked };
}

/** Normaliza título para comparação de duplicidade (acentos, caixa, espaços). */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

  // REGRA Nº 1: nunca a mesma pauta para dois clientes (nem repetida para o
  // mesmo cliente). Título normalizado igual nos últimos 14 dias → recusa a
  // entrega e registra para o admin; o Make deve gerar um novo ângulo.
  const normalized = normalizeTitle(p.title);
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data: recentAll } = await supabase
    .from("daily_opportunities")
    .select("user_id, title")
    .gte("created_at", since)
    .limit(2000);
  const clash = (recentAll ?? []).find((o) => normalizeTitle(o.title) === normalized);
  if (clash) {
    const reason = clash.user_id === p.user_id ? "duplicate_for_client" : "duplicate_across_clients";
    await supabase.from("system_errors").insert({
      tenant_id: tenantId,
      scope: "make",
      message: `Pauta duplicada recusada (${reason}): "${p.title}"`,
      context: { user_id: p.user_id, conflict_user_id: clash.user_id, title: p.title },
    });
    return {
      accepted: false,
      reason,
      message:
        "Pauta recusada: título idêntico já entregue nos últimos 14 dias. Gere um ângulo e um título exclusivos para este cliente.",
    };
  }

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
