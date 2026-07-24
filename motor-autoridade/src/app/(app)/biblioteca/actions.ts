"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";

export type DeleteResult = { ok: false; error: string } | { ok: true };

/**
 * Exclui (soft-delete) um conteúdo da biblioteca: marca deleted_at, então ele
 * some das listas mas o histórico/eventos ficam preservados. RLS garante que o
 * usuário só apaga o próprio conteúdo.
 */
export async function deleteContentItem(itemId: string): Promise<DeleteResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("content_items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: "Não foi possível excluir. Tente novamente." };

  revalidatePath("/biblioteca");
  return { ok: true };
}
