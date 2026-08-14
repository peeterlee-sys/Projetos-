import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { secretarios, releases } from "@/lib/db/schema";
import { normTel, newId, badRequest } from "@/lib/http";
import { NextResponse } from "next/server";

/**
 * Webhook para o Make gravar um release gerado.
 * O secretário é identificado pelo telefone (cadastro) → define a prefeitura.
 * Header obrigatório: x-webhook-secret
 *
 * body: { telefone, origem?, transcricao?, headline?, release?, instagram?, flag? }
 */
function authorized(req: Request): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  return !!secret && req.headers.get("x-webhook-secret") === secret;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const b = await req.json().catch(() => ({}));
  const telefone = normTel(b.telefone ?? "");
  if (!telefone) return badRequest("telefone obrigatório");

  const [sec] = await db
    .select()
    .from(secretarios)
    .where(and(eq(secretarios.telefone, telefone), eq(secretarios.ativo, true)))
    .limit(1);

  if (!sec) {
    return NextResponse.json(
      { error: "secretário não cadastrado", cadastrado: false },
      { status: 404 },
    );
  }

  const id = newId();
  await db.insert(releases).values({
    id,
    prefeituraId: sec.prefeituraId,
    secretarioId: sec.id,
    secretarioNome: sec.nome,
    secretaria: sec.secretaria,
    origem: b.origem === "texto" ? "texto" : "audio",
    transcricao: b.transcricao ?? null,
    headline: b.headline ?? null,
    release: b.release ?? null,
    instagram: b.instagram ?? null,
    status: "pendente",
    flag: !!b.flag,
  });

  return NextResponse.json({ ok: true, releaseId: id, prefeituraId: sec.prefeituraId });
}
