"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { onboardingSchema } from "@/lib/validation/onboarding";

export type OnboardingResult = { ok: false; error: string } | { ok: true };

/**
 * Persiste o onboarding: garante tenant, grava perfil e preferências,
 * constrói o contexto_mestre e marca onboarded_at.
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
    const { data: tenant, error: tenantErr } = await supabase
      .from("tenants")
      .insert({ name: data.display_name || data.full_name, slug, status: "trial" })
      .select("id")
      .single();
    if (tenantErr || !tenant) {
      return { ok: false, error: "Não foi possível criar seu espaço. Tente novamente." };
    }
    tenantId = tenant.id;
    await supabase.from("users").update({ tenant_id: tenantId, full_name: data.full_name }).eq("id", user.id);
  } else if (data.full_name && data.full_name !== me?.full_name) {
    await supabase.from("users").update({ full_name: data.full_name }).eq("id", user.id);
  }

  // Perfil editorial (upsert idempotente por user_id).
  const { error: profileErr } = await supabase.from("client_profiles").upsert(
    {
      tenant_id: tenantId,
      user_id: user.id,
      display_name: data.display_name || null,
      profession: data.profession || null,
      company: data.company || null,
      field_of_work: data.field_of_work || null,
      specialties: data.specialties,
      city: data.city || null,
      target_audience: data.target_audience || null,
      audience_pains: data.audience_pains || null,
      goals: data.goals || null,
      main_themes: data.main_themes,
      forbidden_themes: data.forbidden_themes,
      tone_of_voice: data.tone_of_voice || null,
      channels: data.channels,
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

  // Constrói o contexto_mestre via função do banco e persiste no perfil.
  const { data: ctx } = await supabase.rpc("build_contexto_mestre", { p_user_id: user.id });
  await supabase
    .from("client_profiles")
    .update({ contexto_mestre: ctx ?? {} })
    .eq("user_id", user.id);

  // Marca onboarding como concluído.
  await supabase.from("users").update({ onboarded_at: new Date().toISOString() }).eq("id", user.id);

  redirect("/hoje");
}
