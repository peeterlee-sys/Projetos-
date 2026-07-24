"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";

/**
 * Ações da matriz de fontes por segmento. Escrita restrita a super_admin
 * (garantida pela RLS de segment_sources + checagem aqui). As fontes do
 * segmento são o piso; as fontes próprias de cada cliente têm prioridade.
 */
async function assertSuper() {
  const user = await getSessionUser();
  if (!user || user.role !== "super_admin") {
    throw new Error("Apenas super administradores podem editar a matriz de fontes.");
  }
}

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  segment: z.string().min(2, "Informe o segmento."),
  name: z.string().min(2, "Informe o nome da fonte."),
  url: z.string().optional().default(""),
  kind: z.enum(["news", "rss", "institutional"]).default("news"),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
});

export type SourceActionResult = { ok: false; error: string } | { ok: true };

export async function upsertSegmentSource(raw: unknown): Promise<SourceActionResult> {
  await assertSuper();
  const parsed = upsertSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;
  const supabase = await createClient();

  const row = {
    segment: d.segment.trim().toLowerCase(),
    name: d.name.trim(),
    url: d.url.trim() || null,
    kind: d.kind,
    priority: d.priority,
  };

  const { error } = d.id
    ? await supabase.from("segment_sources").update(row).eq("id", d.id)
    : await supabase.from("segment_sources").insert(row);

  if (error) {
    const msg = error.message.includes("duplicate")
      ? "Já existe uma fonte com esse nome nesse segmento."
      : "Não foi possível salvar a fonte.";
    return { ok: false, error: msg };
  }
  revalidatePath("/admin/fontes");
  return { ok: true };
}

export async function deleteSegmentSource(id: string): Promise<SourceActionResult> {
  await assertSuper();
  const supabase = await createClient();
  const { error } = await supabase.from("segment_sources").delete().eq("id", id);
  if (error) return { ok: false, error: "Não foi possível remover a fonte." };
  revalidatePath("/admin/fontes");
  return { ok: true };
}

export async function toggleSegmentSource(id: string, isActive: boolean): Promise<SourceActionResult> {
  await assertSuper();
  const supabase = await createClient();
  const { error } = await supabase.from("segment_sources").update({ is_active: isActive }).eq("id", id);
  if (error) return { ok: false, error: "Não foi possível atualizar a fonte." };
  revalidatePath("/admin/fontes");
  return { ok: true };
}
