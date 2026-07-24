"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";

export type AdminActionResult = { ok: false; error: string } | { ok: true };

async function assertAdmin() {
  const user = await getSessionUser();
  if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
    throw new Error("Sem permissão.");
  }
  return user;
}

/**
 * Aprova (ativa) ou suspende um cadastro. A RLS garante o escopo: admin só
 * altera usuários do próprio tenant; super_admin altera qualquer um.
 */
export async function setUserActive(raw: unknown): Promise<AdminActionResult> {
  await assertAdmin();
  const { userId, active } = z
    .object({ userId: z.string().uuid(), active: z.boolean() })
    .parse(raw);

  const supabase = await createClient();
  const { error } = await supabase.from("users").update({ is_active: active }).eq("id", userId);
  if (error) return { ok: false, error: "Não foi possível atualizar o cadastro." };

  revalidatePath("/admin");
  return { ok: true };
}
