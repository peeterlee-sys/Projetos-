import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { releases, fotos } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { unauthorized, forbidden } from "@/lib/http";

/**
 * Descarta em lote os itens "aguardando assunto" (fotos enviadas sem o
 * assunto — tipicamente testes/incompletos) da prefeitura do usuário.
 * Apaga as fotos vinculadas e depois os releases.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!user.prefeituraId) return forbidden();

  const alvo = await db
    .select({ id: releases.id })
    .from(releases)
    .where(and(eq(releases.prefeituraId, user.prefeituraId), eq(releases.status, "aguardando")));
  const ids = alvo.map((r) => r.id);

  if (ids.length) {
    await db.delete(fotos).where(inArray(fotos.releaseId, ids));
    await db.delete(releases).where(inArray(releases.id, ids));
  }

  return NextResponse.json({ ok: true, removed: ids.length });
}
