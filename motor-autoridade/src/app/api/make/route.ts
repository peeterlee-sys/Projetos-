import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { claimIdempotency, finishExecution, verifyMakeSignature, verifyMakeSecret } from "@/lib/make/security";
import { rateLimit } from "@/lib/rate-limit";
import { fetchRadar } from "@/lib/radar/fetch";
import { phoneVariants } from "@/lib/phone";

export const runtime = "nodejs";
// O get_radar faz buscas externas (Google News) — dá folga além do timeout padrão.
export const maxDuration = 30;

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
    case "get_vereador":
      return getVereador(supabase, payload);
    case "get_briefing":
      return getBriefing(supabase, payload);
    case "get_sources":
      return getSources(supabase, payload);
    case "get_radar":
      return getRadar(supabase, payload);
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
      "id, full_name, tenant_id, client_profiles(main_themes, tone_of_voice, target_audience, segment, positioning_recognition, editorial_dna, political_name, party, city, state, phone, profile_track)"
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
      // Identificação do mandato (trilha política): o Make usa o telefone como
      // chave do WhatsApp e cidade/partido para contextualizar a pauta.
      political_name: p?.political_name ?? null,
      phone: p?.phone ?? null,
      party: p?.party ?? null,
      city: p?.city ?? null,
      state: p?.state ?? null,
      track: p?.profile_track ?? "generic",
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

/**
 * Radar de notícias REAIS do cliente: manchetes atuais das fontes/temas dele,
 * prontas para o Claude escolher e traduzir ao ângulo do cliente. É o coração
 * do produto — "assunto do dia na linguagem do cliente".
 */
async function getRadar(supabase: Supabase, payload: Record<string, unknown>) {
  const { user_id } = z.object({ user_id: z.string().uuid() }).parse(payload);
  const radar = await fetchRadar(supabase, user_id);
  return { radar };
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
  // Marca a última geração no perfil (coluna lida pelo dashboard admin).
  await supabase
    .from("client_profiles")
    .update({ last_generation_at: new Date().toISOString() })
    .eq("user_id", p.user_id);

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

/** Campos do mandato que o Assessor 24h carrega a cada resposta de WhatsApp. */
const VEREADOR_FIELDS =
  "user_id, display_name, political_name, phone, city, state, party, mandate, positions, " +
  "political_spectrum, flags, electoral_base, voter_profile, audience_pains, local_context, " +
  "main_themes, forbidden_themes, adversaries, mayor_relation, history_to_avoid, core_values, " +
  "tone_profile, tone_of_voice, slang_expressions, emojis, how_to_refer, catchphrase, " +
  "instagram_url, website_url, reference_publications, local_press, audience_segments, " +
  "positioning_recognition, editorial_dna, contexto_mestre, dna_generated_at, profile_track";

/**
 * Bloco de texto livre com o perfil e as diretrizes do mandato — equivalente
 * à coluna "Perfil" da planilha antiga, montado a partir dos campos brutos da
 * anamnese (não depende do DNA Editorial gerado por IA, que é best-effort).
 */
function buildPerfilTexto(p: Record<string, unknown>): string {
  const lines: string[] = [];
  const push = (label: string, value: unknown) => {
    if (Array.isArray(value)) {
      if (value.length) lines.push(`${label}: ${value.join(", ")}`);
    } else if (typeof value === "string" && value.trim()) {
      lines.push(`${label}: ${value.trim()}`);
    }
  };
  push("Espectro político", p.political_spectrum);
  push("Bandeiras", p.flags);
  push("Base eleitoral", p.electoral_base);
  push("Perfil do eleitorado", p.voter_profile);
  push("Tom de voz", p.tone_of_voice);
  push("Gírias/expressões", p.slang_expressions);
  push("Uso de emojis", p.emojis);
  push("Como se referir a ele(a)", p.how_to_refer);
  push("Bordão", p.catchphrase);
  push("Valores inegociáveis", p.core_values);
  push("Relação com o prefeito", p.mayor_relation);
  push("NUNCA aborde estes temas", p.forbidden_themes);
  push("NUNCA cite estes nomes/adversários", p.adversaries);
  push("Histórico a evitar", p.history_to_avoid);
  return lines.join("\n");
}

/**
 * ASSESSOR 24H — substitui a busca na "Planilha de Nomes".
 * Dado o telefone do WhatsApp (ou o user_id), devolve o mandato completo com o
 * DNA Editorial. Se o vereador ainda não fez a anamnese no app, cai no registro
 * importado da planilha (legacy_vereadores) para o assistente não ficar mudo.
 */
async function getVereador(supabase: Supabase, payload: Record<string, unknown>) {
  const p = z
    .object({ phone: z.string().optional(), user_id: z.string().uuid().optional() })
    .refine((v) => v.phone || v.user_id, { message: "informe phone ou user_id" })
    .parse(payload);

  const variants = p.phone ? phoneVariants(p.phone) : [];
  if (p.phone && variants.length === 0) {
    return { found: false, reason: "telefone_invalido", phone: p.phone };
  }

  let query = supabase.from("client_profiles").select(VEREADOR_FIELDS).limit(1);
  query = p.user_id ? query.eq("user_id", p.user_id) : query.in("phone", variants);
  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);

  // O select é montado a partir de uma constante, então o supabase-js não infere
  // o formato da linha — tratamos como registro solto e devolvemos como veio.
  const profile = (rows ?? [])[0] as unknown as Record<string, unknown> | undefined;

  if (!profile) {
    // Fallback: vereador ainda sem conta no app — usa o que veio das planilhas.
    const { data: legacy } = await supabase
      .from("legacy_vereadores")
      .select("phone, name, political_name, party, city, state, local_context, profile_text, form_answers, editorial_dna")
      .in("phone", variants)
      .maybeSingle();

    if (!legacy) return { found: false, reason: "nao_cadastrado", phone: p.phone ?? null };

    return {
      found: true,
      source: "legacy",
      vereador: {
        user_id: null,
        name: legacy.name,
        political_name: legacy.political_name ?? legacy.name,
        phone: legacy.phone,
        party: legacy.party,
        city: legacy.city,
        state: legacy.state,
        local_context: legacy.local_context,
        perfil_texto: legacy.profile_text,
        respostas_formulario: legacy.form_answers ?? {},
        editorial_dna: legacy.editorial_dna ?? {},
        anamnese_pendente: true,
      },
    };
  }

  const userId = profile.user_id as string;
  const city = profile.city as string | null;
  const state = profile.state as string | null;
  const [{ data: user }, { data: sources }, { data: recent }, { data: cityCtx }] = await Promise.all([
    supabase.from("users").select("full_name, email").eq("id", userId).maybeSingle(),
    supabase
      .from("influence_sources")
      .select("kind, label, url, priority, is_blocked")
      .eq("user_id", userId)
      .limit(100),
    supabase
      .from("daily_opportunities")
      .select("title, theme, opportunity_date")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5),
    city && state
      ? supabase.from("city_contexts").select("context").ilike("city", city).eq("state", state).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const allSources = sources ?? [];
  // Contexto da cidade é biblioteca do admin (city_contexts) — busca ao vivo
  // a cada resposta, para valer a atualização mais recente do admin em vez do
  // valor que ficou congelado em client_profiles.local_context na anamnese.
  const localContext = cityCtx?.context?.trim() || (profile.local_context as string | null) || null;

  return {
    found: true,
    source: "app",
    vereador: {
      ...profile,
      name: user?.full_name ?? profile.political_name ?? null,
      email: user?.email ?? null,
      local_context: localContext,
      perfil_texto: buildPerfilTexto(profile),
      fontes: allSources
        .filter((s) => !s.is_blocked)
        .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1))
        .map((s) => ({ kind: s.kind, name: s.label, url: s.url, priority: s.priority })),
      fontes_bloqueadas: allSources.filter((s) => s.is_blocked).map((s) => s.label ?? s.url ?? ""),
      pautas_recentes: recent ?? [],
      anamnese_pendente: false,
    },
  };
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
