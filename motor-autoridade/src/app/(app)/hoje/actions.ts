"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { trackEvent } from "@/lib/events/track";

/**
 * Inicia um conteúdo a partir de uma oportunidade do dia: cria o content_item,
 * marca a oportunidade como escolhida, registra eventos e leva ao workspace.
 */
export async function startContent(formData: FormData): Promise<void> {
  const opportunityId = String(formData.get("opportunity_id") ?? "");
  const user = await requireUser();
  if (!user.tenant_id) redirect("/onboarding");
  const supabase = await createClient();

  const { data: opp } = await supabase
    .from("daily_opportunities")
    .select("id, title, theme")
    .eq("id", opportunityId)
    .maybeSingle();
  if (!opp) redirect("/hoje");

  const { data: item, error } = await supabase
    .from("content_items")
    .insert({
      tenant_id: user.tenant_id,
      user_id: user.id,
      opportunity_id: opp.id,
      title: opp.title,
      theme: opp.theme,
      status: "in_production",
    })
    .select("id")
    .single();
  if (error || !item) redirect("/hoje");

  await supabase.from("daily_opportunities").update({ status: "chosen" }).eq("id", opp.id);
  await trackEvent(supabase, {
    tenantId: user.tenant_id,
    userId: user.id,
    contentId: item.id,
    eventType: "conteudo_aberto",
    metadata: { opportunity_id: opp.id },
  });

  redirect(`/conteudo/${item.id}`);
}
