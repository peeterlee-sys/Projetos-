"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";

export type BrandResult = { ok: false; error: string } | { ok: true };

const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use uma cor no formato #RRGGBB.");

// Logo embutido como data URL (evita configurar Storage). Limite ~200 KB já
// resizado no cliente; validação defensiva de prefixo e tamanho.
const logo = z
  .string()
  .max(300_000, "Logo muito grande — use uma imagem menor.")
  .refine((s) => s === "" || s.startsWith("data:image/"), "Logo inválido.")
  .optional();

const brandSchema = z.object({
  brand_primary: hex,
  brand_secondary: hex,
  brand_accent: hex,
  logo_url: logo,
});

/** Salva a identidade visual do cliente (cores + logo) no perfil editorial. */
export async function saveBrand(raw: unknown): Promise<BrandResult> {
  const parsed = brandSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;

  const user = await requireUser();
  const supabase = await createClient();

  const update: Record<string, unknown> = {
    brand_primary: data.brand_primary,
    brand_secondary: data.brand_secondary,
    brand_accent: data.brand_accent,
  };
  // logo_url só é alterado quando enviado (string vazia = remover).
  if (data.logo_url !== undefined) {
    update.logo_url = data.logo_url === "" ? null : data.logo_url;
  }

  const { error } = await supabase
    .from("client_profiles")
    .update(update)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: "Não foi possível salvar. Tente novamente." };

  revalidatePath("/perfil");
  return { ok: true };
}
