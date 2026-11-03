import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { releases, contextos } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { ensureSchema } from "@/lib/db/ensure";
import { gerarRadio } from "@/lib/ai";
import { unauthorized, forbidden, notFound, badRequest } from "@/lib/http";

export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

/** Gera (sob demanda) o boletim de rádio para um release já existente. */
export async function POST(_req: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  await ensureSchema();

  const [r] = await db.select().from(releases).where(eq(releases.id, id)).limit(1);
  if (!r) return notFound();
  if (user.papel !== "admin" && r.prefeituraId !== user.prefeituraId) return forbidden();

  const mensagem = (r.transcricao || r.release || "").trim();
  if (!mensagem) return badRequest("Sem conteúdo para gerar o boletim de rádio.");

  const [ctx] = await db
    .select()
    .from(contextos)
    .where(eq(contextos.prefeituraId, r.prefeituraId))
    .limit(1);

  const autor = [r.secretarioNome, r.secretaria].filter(Boolean).join(" — ") || "Secretaria";

  try {
    const radio = await gerarRadio({ ctx: ctx ?? null, autor, mensagem });
    await db.update(releases).set({ radio, atualizadoEm: new Date() }).where(eq(releases.id, id));
    return NextResponse.json({ ok: true, radio });
  } catch (e) {
    console.error("[releases/radio]", e);
    return NextResponse.json({ error: "Não consegui gerar o boletim de rádio agora." }, { status: 500 });
  }
}
