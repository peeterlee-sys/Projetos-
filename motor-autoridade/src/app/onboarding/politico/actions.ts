"use server";

import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { anamnesePoliticaSchema } from "@/lib/validation/anamnese-politica";
import { generatePoliticalDna } from "@/lib/dna/political";

export type AnamneseResult = { ok: false; error: string } | { ok: true };

/**
 * Persiste a ANAMNESE POLÍTICA do vereador: garante tenant, grava o perfil da
 * trilha 'political', preferências, fontes e referências; constrói o
 * contexto_mestre, gera o DNA Editorial político e marca a anamnese concluída.
 * Todas as escritas respeitam a RLS (o usuário só grava o próprio registro).
 */
export async function submitAnamnesePolitica(raw: unknown): Promise<AnamneseResult> {
  const parsed = anamnesePoliticaSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sessão expirada. Faça login novamente." };

  // O telefone é a chave do assistente no WhatsApp: não pode pertencer a outro.
  const { data: phoneOwner } = await supabase
    .from("client_profiles")
    .select("user_id")
    .eq("phone", data.phone)
    .maybeSingle();
  if (phoneOwner && phoneOwner.user_id !== user.id) {
    return { ok: false, error: "Este WhatsApp já está cadastrado em outro mandato." };
  }

  // Garante que o usuário tem um tenant. Mandato solo → tenant próprio.
  const { data: me } = await supabase
    .from("users")
    .select("tenant_id, full_name")
    .eq("id", user.id)
    .maybeSingle();

  let tenantId = me?.tenant_id ?? null;
  if (!tenantId) {
    const slug = `${(data.political_name || data.full_name)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")}-${user.id.slice(0, 6)}`;
    const { data: newTenantId, error: tenantErr } = await supabase.rpc("create_my_tenant", {
      p_name: data.political_name || data.full_name,
      p_slug: slug,
    });
    if (tenantErr || !newTenantId) {
      return { ok: false, error: "Não foi possível criar seu espaço. Tente novamente." };
    }
    tenantId = newTenantId as string;
    await supabase.from("users").update({ full_name: data.full_name }).eq("id", user.id);
  } else if (data.full_name && data.full_name !== me?.full_name) {
    await supabase.from("users").update({ full_name: data.full_name }).eq("id", user.id);
  }

  // Contexto da cidade: é o admin quem mantém (biblioteca por cidade+UF), não
  // o vereador. Aqui só herdamos o contexto já cadastrado da cidade — e só se
  // o perfil ainda não tiver um (nunca sobrescreve o que o admin já escreveu,
  // nem numa segunda vez que o vereador refaça a anamnese).
  const stateUpper = data.state.toUpperCase();
  const { data: existingProfile } = await supabase
    .from("client_profiles")
    .select("local_context")
    .eq("user_id", user.id)
    .maybeSingle();

  let localContext: string | undefined;
  if (!existingProfile?.local_context) {
    const { data: cityCtx } = await supabase
      .from("city_contexts")
      .select("context")
      .ilike("city", data.city)
      .eq("state", stateUpper)
      .maybeSingle();
    if (cityCtx?.context) localContext = cityCtx.context;
  }

  const { error: profileErr } = await supabase.from("client_profiles").upsert(
    {
      tenant_id: tenantId,
      user_id: user.id,
      profile_track: "political",
      segment: "vereadores",
      profession: "Vereador(a)",
      // 1. Identificação
      display_name: data.political_name,
      political_name: data.political_name,
      phone: data.phone,
      city: data.city,
      state: stateUpper,
      party: data.party || null,
      mandate: data.mandate || null,
      positions: data.positions,
      ...(localContext ? { local_context: localContext } : {}),
      // 2. Posicionamento
      political_spectrum: data.political_spectrum,
      flags: data.flags,
      electoral_base: data.electoral_base || null,
      voter_profile: data.voter_profile || null,
      target_audience: data.voter_profile || null,
      audience_pains: data.audience_pains || null,
      positioning_recognition: data.positioning_recognition || null,
      // 3. Tom e estilo
      tone_profile: data.tone_profile,
      tone_of_voice: data.tone_of_voice || data.tone_profile.join(", ") || null,
      slang_expressions: data.slang_expressions,
      emojis: data.emojis,
      how_to_refer: data.how_to_refer || null,
      catchphrase: data.catchphrase || null,
      // 4. Limites
      forbidden_themes: data.forbidden_themes,
      adversaries: data.adversaries,
      mayor_relation: data.mayor_relation || null,
      history_to_avoid: data.history_to_avoid || null,
      core_values: data.core_values || null,
      // 5. Referências
      instagram_url: data.instagram_url || null,
      website_url: data.website_url || null,
      reference_publications: data.reference_publications,
      local_press: data.local_press,
      // 7. Preferências
      main_themes: data.main_themes.length > 0 ? data.main_themes : data.flags,
      audience_segments: data.audience_segments,
      publish_days_per_week: data.publish_days_per_week,
      follow_up_level: data.follow_up_level,
    },
    { onConflict: "user_id" }
  );
  if (profileErr) return { ok: false, error: "Falha ao salvar o perfil do mandato." };

  const { error: prefErr } = await supabase.from("client_preferences").upsert(
    {
      tenant_id: tenantId,
      user_id: user.id,
      video_duration_sec: data.video_duration_sec,
      preferred_formats: data.preferred_formats,
      weekly_goal: data.weekly_goal,
      preferred_days: data.preferred_days,
      notification_level: data.follow_up_level,
    },
    { onConflict: "user_id" }
  );
  if (prefErr) return { ok: false, error: "Falha ao salvar as preferências." };

  // Fontes: as escolhidas + a imprensa local (etapa 5) + as bloqueadas em texto
  // livre. Substitui o conjunto do usuário — a anamnese é sempre idempotente.
  const pressRows = data.local_press
    .map((s) => s.trim())
    .filter(Boolean)
    .map((label) => ({
      kind: "site" as const,
      label,
      url: "",
      priority: "high" as const,
      is_blocked: false,
    }));

  const blockedRows = (data.blocked_sources ?? "")
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((label) => ({
      kind: "other" as const,
      label,
      url: "",
      priority: "low" as const,
      is_blocked: true,
    }));

  const sourceRows = [...data.influence_sources, ...pressRows, ...blockedRows]
    .filter((s) => s.label?.trim() || s.url?.trim())
    .map((s) => ({
      tenant_id: tenantId,
      user_id: user.id,
      kind: s.kind,
      label: s.label?.trim() || null,
      url: s.url?.trim() || null,
      priority: s.priority,
      is_blocked: s.is_blocked,
    }));

  await supabase.from("influence_sources").delete().eq("user_id", user.id);
  if (sourceRows.length > 0) {
    const { error: srcErr } = await supabase.from("influence_sources").insert(sourceRows);
    if (srcErr) return { ok: false, error: "Falha ao salvar as fontes." };
  }

  const refRows = data.inspiration_refs
    .filter((r) => r.url.trim())
    .map((r) => ({
      tenant_id: tenantId,
      user_id: user.id,
      kind: r.kind,
      url: r.url.trim(),
      name: r.name?.trim() || null,
    }));

  await supabase.from("inspiration_refs").delete().eq("user_id", user.id);
  if (refRows.length > 0) {
    const { error: refErr } = await supabase.from("inspiration_refs").insert(refRows);
    if (refErr) return { ok: false, error: "Falha ao salvar as referências." };
  }

  const { data: ctx } = await supabase.rpc("build_contexto_mestre", { p_user_id: user.id });
  await supabase
    .from("client_profiles")
    .update({ contexto_mestre: ctx ?? {} })
    .eq("user_id", user.id);

  // DNA Editorial político (best-effort: falha de IA não trava a anamnese —
  // o DNA pode ser regerado depois e o erro fica registrado para o admin).
  try {
    await generatePoliticalDna(supabase, { tenantId, userId: user.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "falha ao gerar DNA Editorial";
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      await createServiceClient().from("system_errors").insert({
        tenant_id: tenantId,
        scope: "ai",
        message,
        context: { step: "political_dna", user_id: user.id },
      });
    }
  }

  // Vincula o registro importado da planilha (mesmo telefone), se existir:
  // a partir daqui o assistente responde pelo perfil vivo do app.
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    await createServiceClient()
      .from("legacy_vereadores")
      .update({ linked_user_id: user.id })
      .eq("phone", data.phone);
  }

  await supabase.from("users").update({ onboarded_at: new Date().toISOString() }).eq("id", user.id);

  redirect("/hoje");
}
