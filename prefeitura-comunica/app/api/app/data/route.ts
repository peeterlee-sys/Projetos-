import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { releases, secretarios, contextos, fotos, type Foto } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { unauthorized, forbidden } from "@/lib/http";
import { NextResponse } from "next/server";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!user.prefeituraId) return forbidden();
  const prefId = user.prefeituraId;

  const [rel, secs, ctx, fotoRows] = await Promise.all([
    db.select().from(releases).where(eq(releases.prefeituraId, prefId)).orderBy(desc(releases.criadoEm)),
    db.select().from(secretarios).where(eq(secretarios.prefeituraId, prefId)).orderBy(asc(secretarios.nome)),
    db.select().from(contextos).where(eq(contextos.prefeituraId, prefId)).limit(1),
    db.select().from(fotos).where(eq(fotos.prefeituraId, prefId)),
  ]);

  const byRelease = new Map<string, Foto[]>();
  for (const f of fotoRows) {
    const arr = byRelease.get(f.releaseId) ?? [];
    arr.push(f);
    byRelease.set(f.releaseId, arr);
  }

  return NextResponse.json({
    user: { nome: user.nome, email: user.email, papel: user.papel },
    prefeitura: user.prefeitura,
    releases: rel.map((r) => ({ ...r, fotos: byRelease.get(r.id) ?? [] })),
    secretarios: secs,
    contexto: ctx[0] ?? null,
  });
}
