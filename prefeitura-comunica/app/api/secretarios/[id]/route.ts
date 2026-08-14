import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { secretarios } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { ok, unauthorized, forbidden, notFound, normTel } from "@/lib/http";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const [s] = await db.select().from(secretarios).where(eq(secretarios.id, id)).limit(1);
  if (!s) return notFound();
  if (user.papel !== "admin" && s.prefeituraId !== user.prefeituraId) return forbidden();

  const b = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof b.nome === "string") patch.nome = b.nome.trim();
  if (typeof b.cargo === "string") patch.cargo = b.cargo.trim();
  if (typeof b.secretaria === "string") patch.secretaria = b.secretaria.trim();
  if (typeof b.telefone === "string") patch.telefone = normTel(b.telefone);
  if (typeof b.ativo === "boolean") patch.ativo = b.ativo;

  if (Object.keys(patch).length) {
    await db.update(secretarios).set(patch).where(eq(secretarios.id, id));
  }
  return ok();
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const [s] = await db.select().from(secretarios).where(eq(secretarios.id, id)).limit(1);
  if (!s) return notFound();
  if (user.papel !== "admin" && s.prefeituraId !== user.prefeituraId) return forbidden();

  await db.delete(secretarios).where(eq(secretarios.id, id));
  return ok();
}
