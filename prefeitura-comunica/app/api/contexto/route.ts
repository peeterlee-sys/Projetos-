import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { contextos } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { ok, unauthorized, forbidden, newId } from "@/lib/http";
import { NextResponse } from "next/server";

const FIELDS = [
  "prefeito", "vice", "mandato", "lema", "programa",
  "tom", "hashtags", "bairros", "programas", "contexto",
] as const;

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!user.prefeituraId) return forbidden();
  const [ctx] = await db
    .select()
    .from(contextos)
    .where(eq(contextos.prefeituraId, user.prefeituraId))
    .limit(1);
  return NextResponse.json(ctx ?? null);
}

export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!user.prefeituraId) return forbidden();
  const prefId = user.prefeituraId;

  const b = await req.json().catch(() => ({}));
  const values: Record<string, unknown> = { atualizadoEm: new Date() };
  for (const f of FIELDS) if (typeof b[f] === "string") values[f] = b[f];
  if (Array.isArray(b.modelos)) {
    values.modelos = b.modelos.filter((m: unknown) => typeof m === "string");
  }

  const [existing] = await db
    .select({ id: contextos.id })
    .from(contextos)
    .where(eq(contextos.prefeituraId, prefId))
    .limit(1);

  if (existing) {
    await db.update(contextos).set(values).where(eq(contextos.prefeituraId, prefId));
  } else {
    await db.insert(contextos).values({
      id: newId(),
      prefeituraId: prefId,
      ...values,
    });
  }
  return ok();
}
