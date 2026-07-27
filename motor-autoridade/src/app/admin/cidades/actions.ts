"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";

/**
 * Biblioteca de contexto por cidade — mantida pelo admin, não pelo vereador.
 * Um contexto por cidade/UF serve todos os vereadores dela: escrito uma vez,
 * herdado por quem preenche a anamnese depois (actions.ts do wizard político),
 * e aplicável de uma vez aos que já responderam sem contexto.
 */
async function assertAdmin() {
  const user = await getSessionUser();
  if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
    throw new Error("Apenas administradores podem editar o contexto das cidades.");
  }
  return user;
}

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  city: z.string().min(2, "Informe a cidade."),
  state: z.string().min(2, "Informe a UF.").max(2, "Use a sigla da UF, ex.: SC."),
  context: z.string().min(1, "Escreva o contexto da cidade."),
});

export type CityActionResult = { ok: false; error: string } | { ok: true; appliedTo?: number };

export async function upsertCityContext(raw: unknown): Promise<CityActionResult> {
  const admin = await assertAdmin();
  const parsed = upsertSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;
  const supabase = await createClient();

  const row = {
    city: d.city.trim(),
    state: d.state.trim().toUpperCase(),
    context: d.context.trim(),
    updated_by: admin.id,
  };

  const { data: saved, error } = d.id
    ? await supabase.from("city_contexts").update(row).eq("id", d.id).select("id").single()
    : await supabase
        .from("city_contexts")
        .upsert(row, { onConflict: "city,state" })
        .select("id")
        .single();

  if (error || !saved) {
    return { ok: false, error: "Não foi possível salvar o contexto da cidade." };
  }

  // Aplica a todos os vereadores dessa cidade que ainda não têm contexto —
  // assim quem já respondeu a anamnese antes de o admin cadastrar a cidade
  // também é atualizado, sem precisar refazer nada.
  const { data: applied } = await supabase
    .from("client_profiles")
    .update({ local_context: row.context })
    .ilike("city", row.city)
    .eq("state", row.state)
    .or("local_context.is.null,local_context.eq.")
    .select("user_id");

  revalidatePath("/admin/cidades");
  revalidatePath("/admin");
  return { ok: true, appliedTo: applied?.length ?? 0 };
}

export async function deleteCityContext(id: string): Promise<CityActionResult> {
  await assertAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("city_contexts").delete().eq("id", id);
  if (error) return { ok: false, error: "Não foi possível remover o contexto." };
  revalidatePath("/admin/cidades");
  return { ok: true };
}
