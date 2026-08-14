import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { secretarios } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { unauthorized, forbidden, badRequest, normTel, newId } from "@/lib/http";
import { NextResponse } from "next/server";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!user.prefeituraId) return forbidden();
  const rows = await db
    .select()
    .from(secretarios)
    .where(eq(secretarios.prefeituraId, user.prefeituraId))
    .orderBy(asc(secretarios.nome));
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!user.prefeituraId) return forbidden();

  const b = await req.json().catch(() => ({}));
  const nome = String(b.nome ?? "").trim();
  const telefone = normTel(b.telefone ?? "");
  if (!nome) return badRequest("Informe o nome do secretário");
  if (telefone.length < 12) return badRequest("Telefone incompleto — use DDD + número");

  const id = newId();
  await db.insert(secretarios).values({
    id,
    prefeituraId: user.prefeituraId,
    nome,
    cargo: b.cargo?.trim() || null,
    secretaria: b.secretaria?.trim() || null,
    telefone,
    ativo: true,
  });
  return NextResponse.json({ ok: true, id });
}
