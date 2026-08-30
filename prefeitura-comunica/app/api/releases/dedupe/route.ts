import { asc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { releases, fotos } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { unauthorized, forbidden } from "@/lib/http";

/**
 * Remove releases duplicados da prefeitura (efeito das reentregas do webhook).
 * Considera duplicado quando têm o mesmo secretário + mesma headline + mesma
 * transcrição. Mantém o mais antigo de cada grupo e apaga os demais (e as fotos).
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!user.prefeituraId) return forbidden();

  const rows = await db
    .select()
    .from(releases)
    .where(eq(releases.prefeituraId, user.prefeituraId))
    .orderBy(asc(releases.criadoEm));

  const seen = new Set<string>();
  const toDelete: string[] = [];
  for (const r of rows) {
    if (!r.headline) continue; // não mexe em "aguardando assunto" (sem headline)
    const key = `${r.secretarioId ?? ""}|${r.headline}|${(r.transcricao ?? "").slice(0, 200)}`;
    if (seen.has(key)) toDelete.push(r.id);
    else seen.add(key);
  }

  if (toDelete.length) {
    await db.delete(fotos).where(inArray(fotos.releaseId, toDelete));
    await db.delete(releases).where(inArray(releases.id, toDelete));
  }

  return NextResponse.json({ ok: true, removed: toDelete.length });
}
