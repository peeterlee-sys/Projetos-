"use server";

import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { anamnesePoliticaSchema } from "@/lib/validation/anamnese-politica";
import { generatePoliticalDna } from "@/lib/dna/political";
import { normalizeCityState } from "@/lib/text/normalize-city";

export type AnamneseResult = { ok: false; error: string } | { ok: true };

/**
 * Persiste a ANAMNESE POLÍTICA do vereador — espelha o Google Form "Assessor
 * 24h - Anamnese", pergunta por pergunta. Garante tenant, grava o perfil da
 * trilha 'political', constrói o contexto_mestre, gera o DNA Editorial
 * político e marca a anamnese concluída. Todas as escritas respeitam a RLS
 * (o usuário só grava o próprio registro).
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

  // Corrige a grafia da cidade (maiúsculas, acentos, abreviações) antes de
  // gravar e de buscar o contexto — senão erro de digitação do vereador
  // aparece "cru" nos textos gerados e não casa com a biblioteca do admin.
  const normalizedCity = await normalizeCityState(data.city, data.state, {
    tenantId,
    userId: user.id,
  });
  data.city = normalizedCity.city;
  data.state = normalizedCity.state;

  // Contexto da cidade: é o admin quem mantém (biblioteca por cidade+UF), não
  // o vereador — esse campo nem existe no formulário. Aqui só herdamos o
  // contexto já cadastrado da cidade, e só se o perfil ainda não tiver um.
  const { data: existingProfile } = await supabase
    .from("client_profiles")
    .select("local_context, subscription_status")
    .eq("user_id", user.id)
    .maybeSingle();

  let localContext: string | undefined;
  if (!existingProfile?.local_context) {
    const { data: cityCtx } = await supabase
      .from("city_contexts")
      .select("context")
      .ilike("city", data.city)
      .eq("state", data.state)
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
      // SEÇÃO 1 — Identificação
      display_name: data.political_name,
      political_name: data.political_name,
      phone: data.phone,
      city: data.city,
      state: data.state,
      party: data.party,
      mandate: data.mandate,
      positions: data.positions,
      ...(localContext ? { local_context: localContext } : {}),
      // SEÇÃO 2 — Posicionamento político
      political_spectrum: data.political_spectrum,
      flags: data.flags,
      main_themes: data.flags,
      electoral_base: data.electoral_base,
      voter_profile: data.voter_profile,
      target_audience: data.voter_profile,
      // SEÇÃO 3 — Tom e estilo de comunicação
      tone_of_voice: data.tone_of_voice,
      tone_profile: [data.tone_of_voice],
      slang_expressions: [data.slang_style],
      emojis: [data.emoji_style],
      how_to_refer: data.how_to_refer,
      catchphrase: data.catchphrase,
      // SEÇÃO 4 — Limites e cuidados
      forbidden_themes: data.forbidden_themes,
      adversaries: data.adversaries,
      mayor_relation: data.mayor_relation,
      history_to_avoid: data.history_to_avoid,
      // SEÇÃO 5 — Referências
      instagram_url: data.instagram_url || null,
      website_url: data.website_url || null,
      reference_publications: data.reference_publications,
      local_press: data.local_press,
      // SEÇÃO 6 — Consentimento (LGPD)
      lgpd_consent_at: new Date().toISOString(),
      // Trial de 7 dias — só na primeira vez (refazer a anamnese não reinicia
      // nem mexe em quem já é assinante).
      ...(existingProfile
        ? {}
        : {
            subscription_status: "trial",
            trial_ends_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
          }),
    },
    { onConflict: "user_id" }
  );
  if (profileErr) return { ok: false, error: "Falha ao salvar o perfil do mandato." };

  const { data: ctx } = await supabase.rpc("build_contexto_mestre", { p_user_id: user.id });
  await supabase
    .from("client_profiles")
    .update({ contexto_mestre: ctx ?? {} })
    .eq("user_id", user.id);

  // Vincula o registro importado da planilha (mesmo telefone), se existir:
  // a partir daqui o assistente responde pelo perfil vivo do app.
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    await createServiceClient()
      .from("legacy_vereadores")
      .update({ linked_user_id: user.id })
      .eq("phone", data.phone);
  }

  // Conclui a anamnese ANTES de chamar a IA. O DNA é a etapa mais lenta daqui
  // (Opus, até 4.000 tokens) e a única que pode estourar o tempo da função —
  // se ela morresse antes desta linha, o vereador teria preenchido tudo e
  // continuaria marcado como "anamnese pendente", voltando para o formulário.
  await supabase.from("users").update({ onboarded_at: new Date().toISOString() }).eq("id", user.id);

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

  // Não manda para /hoje: aquela tela é o radar de pautas do Take e não
  // existe no Assessor 24h — o produto é 100% sob demanda pelo WhatsApp.
  redirect("/anamnese/obrigado");
}
