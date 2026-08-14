import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { releases } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { ok, unauthorized, forbidden, notFound } from "@/lib/http";

type Params = { params: Promise<{ id: string }> };

const EDITABLE = ["headline", "release", "instagram", "transcricao"] as const;

export async function PATCH(req: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const [r] = await db.select().from(releases).where(eq(releases.id, id)).limit(1);
  if (!r) return notFound();
  if (user.papel !== "admin" && r.prefeituraId !== user.prefeituraId) return forbidden();

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = { atualizadoEm: new Date() };

  for (const k of EDITABLE) if (typeof body[k] === "string") patch[k] = body[k];

  if (typeof body.status === "string") {
    patch.status = body.status;
    if (body.status === "publicado" && r.status !== "publicado") {
      patch.publicadoEm = new Date();
    } else if (body.status !== "publicado") {
      patch.publicadoEm = null;
    }
  }

  await db.update(releases).set(patch).where(eq(releases.id, id));
  return ok();
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const [r] = await db.select().from(releases).where(eq(releases.id, id)).limit(1);
  if (!r) return notFound();
  if (user.papel !== "admin" && r.prefeituraId !== user.prefeituraId) return forbidden();

  await db.delete(releases).where(eq(releases.id, id));
  return ok();
}
