import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { ensurePushTable } from "@/lib/push";
import { unauthorized, forbidden, badRequest, newId, ok } from "@/lib/http";

/**
 * Salva a inscrição de push do aparelho da pessoa logada, ligada à prefeitura.
 * body: { endpoint, keys: { p256dh, auth } }
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!user.prefeituraId) return forbidden();

  const b = await req.json().catch(() => ({}));
  const endpoint = b?.endpoint;
  const p256dh = b?.keys?.p256dh;
  const auth = b?.keys?.auth;
  if (!endpoint || !p256dh || !auth) return badRequest("inscrição inválida");

  await ensurePushTable();

  const [existing] = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint))
    .limit(1);

  if (existing) {
    await db
      .update(pushSubscriptions)
      .set({ prefeituraId: user.prefeituraId, userId: user.id, p256dh, auth })
      .where(eq(pushSubscriptions.endpoint, endpoint));
  } else {
    await db.insert(pushSubscriptions).values({
      id: newId(),
      prefeituraId: user.prefeituraId,
      userId: user.id,
      endpoint,
      p256dh,
      auth,
    });
  }
  return ok();
}

/** Remove a inscrição (quando o usuário desliga as notificações). */
export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const b = await req.json().catch(() => ({}));
  const endpoint = b?.endpoint;
  if (!endpoint) return badRequest("endpoint obrigatório");
  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.endpoint, endpoint),
        user.prefeituraId ? eq(pushSubscriptions.prefeituraId, user.prefeituraId) : undefined,
      ),
    );
  return ok();
}
