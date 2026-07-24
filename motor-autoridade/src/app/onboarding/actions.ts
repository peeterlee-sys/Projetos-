"use server";

import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { onboardingSchema } from "@/lib/validation/onboarding";
import { generateEditorialDna } from "@/lib/dna/generate";

export type OnboardingResult = { ok: false; error: string } | { ok: true };

/**
 * Persiste a ANAMNESE EDITORIAL: garante tenant, grava perfil completo,
 * preferências, fontes de influência e referências; constrói o
 * contexto_mestre, gera o DNA Editorial e marca onboarded_at.
 * Todas as escritas respeitam a RLS (usuário só grava o próprio registro).
 */
export async function submitOnboarding(raw: unknown): Promise<OnboardingResult> {
  const parsed = onboardingSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sessão expirada. Faça login novamente." };

  // Garante que o usuário tem um tenant. Cliente solo → tenant pessoal.
  const { data: me } = await supabase
    .from("users")
    .select("tenant_id, full_name")
    .eq("id", user.id)
    .maybeSingle();

  let tenantId = me?.tenant_id ?? null;
  if (!tenantId) {
    const slug = `${(data.display_name || data.full_name || "cliente")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")}-${user.id.slice(0, 6)}`;
    // Cria o tenant via função SECURITY DEFINER (contorna a RLS com segurança:
    // o próprio banco identifica o usuário por auth.uid() e vincula o tenant).
    const { data: newTenantId, error: tenantErr } = await supabase.rpc("create_my_tenant", {
      p_name: data.display_name || data.full_name,
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

  // Perfil editorial completo (upsert idempotente por user_id).
  const { error: profileErr } = await supabase.from("client_profiles").upsert(
    {
      tenant_id: tenantId,
      user_id: user.id,
      // 1. Identidade
      display_name: data.display_name || null,
      profession: data.profession || null,
      company: data.company || null,
      field_of_work: data.field_of_work || null,
      specialties: data.specialties,
      city: data.city || null,
      state: data.state || null,
      years_experience: data.years_experience || null,
      bio_summary: data.bio_summary || null,
      differentials: data.differentials || null,
      segment: data.segment || null,
      // 2. Objetivo
      objectives: data.objectives,
      objective_other: data.objective_other || null,
      goals: data.goals || null,
      // 3. Público
      target_audience: data.target_audience || null,
      audience_age: data.audience_age || null,
      audience_city: data.audience_city || null,
      audience_class: data.audience_class || null,
      audience_profession: data.audience_profession || null,
      audience_pains: data.audience_pains || null,
      audience_doubts: data.audience_doubts || null,
      audience_objections: data.audience_objections || null,
      // 4. Posicionamento
      positioning_recognition: data.positioning_recognition || null,
      main_themes: data.main_themes,
      forbidden_themes: data.forbidden_themes,
      core_values: data.core_values || null,
      desired_description: data.desired_description || null,
      // 5. Tom
      tone_profile: data.tone_profile,
      tone_of_voice: data.tone_of_voice || data.tone_profile.join(", ") || null,
      channels: data.channels,
      // 6. Produção
      publish_days_per_week: data.publish_days_per_week,
      time_per_day: data.time_per_day || null,
      likes_video: data.likes_video,
      records_alone: data.records_alone,
      has_team: data.has_team,
      // Comportamento
      main_block: data.main_block || null,
      main_motivation: data.main_motivation || null,
      follow_up_level: data.follow_up_level,
    },
    { onConflict: "user_id" }
  );
  if (profileErr) return { ok: false, error: "Falha ao salvar o perfil editorial." };

  const { error: prefErr } = await supabase.from("client_preferences").upsert(
    {
      tenant_id: tenantId,
      user_id: user.id,
      video_duration_sec: data.video_duration_sec,
      preferred_formats: data.preferred_formats,
      weekly_goal: data.weekly_goal,
      preferred_days: data.preferred_days,
      preferred_times: data.preferred_times,
      notification_level: data.follow_up_level,
    },
    { onConflict: "user_id" }
  );
  if (prefErr) return { ok: false, error: "Falha ao salvar as preferências." };

  // 7. Fontes de influência: substitui o conjunto do usuário (idempotente).
  // Fontes bloqueadas em texto livre viram linhas com is_blocked = true.
  const blockedRows = data.blocked_sources
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((label) => ({ kind: "other" as const, label, url: "", priority: "low" as const, is_blocked: true }));

  const sourceRows = [...data.influence_sources, ...blockedRows]
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
    if (srcErr) return { ok: false, error: "Falha ao salvar as fontes de influência." };
  }

  // 8. Referências de inspiração (até 10).
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

  // Constrói o contexto_mestre e persiste no perfil.
  const { data: ctx } = await supabase.rpc("build_contexto_mestre", { p_user_id: user.id });
  await supabase
    .from("client_profiles")
    .update({ contexto_mestre: ctx ?? {} })
    .eq("user_id", user.id);

  // Gera o DNA Editorial (best-effort: uma falha de IA não trava o onboarding —
  // o DNA pode ser regerado depois; o erro fica registrado para o admin).
  try {
    await generateEditorialDna(supabase, { tenantId, userId: user.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "falha ao gerar DNA Editorial";
    // system_errors é restrita a admin na RLS → registra com o service client.
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      await createServiceClient()
        .from("system_errors")
        .insert({ tenant_id: tenantId, scope: "ai", message, context: { step: "editorial_dna", user_id: user.id } });
    }
  }

  // Marca a anamnese como concluída.
  await supabase.from("users").update({ onboarded_at: new Date().toISOString() }).eq("id", user.id);

  redirect("/hoje");
}
