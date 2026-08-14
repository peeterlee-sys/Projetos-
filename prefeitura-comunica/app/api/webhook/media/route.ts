import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { secretarios, releases, fotos } from "@/lib/db/schema";
import { normTel, newId, badRequest } from "@/lib/http";
import { NextResponse } from "next/server";

const JANELA_MS = 2 * 60 * 60 * 1000; // 2 horas

function authorized(req: Request): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  return !!secret && req.headers.get("x-webhook-secret") === secret;
}

/**
 * Webhook para o Make entregar uma FOTO enviada pelo secretário.
 * Regra de reconhecimento:
 *  - acha o secretário pelo telefone;
 *  - se ele tem um release recente (< 2h), anexa a foto a ele;
 *  - senão, cria um item "aguardando assunto" e responde pedindo contexto.
 *
 * body: { telefone, url, legenda? }
 */
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
    return NextResponse.json({ error: "secretário não cadastrado" }, { status: 404 });
  }

  const [ultimo] = await db
    .select()
    .from(releases)
    .where(eq(releases.secretarioId, sec.id))
    .orderBy(desc(releases.criadoEm))
    .limit(1);

  const agora = Date.now();
  const recente =
    ultimo && ultimo.criadoEm && agora - ultimo.criadoEm.getTime() <= JANELA_MS;

  if (recente && !ultimo.aguardando) {
    await db.insert(fotos).values({
      id: newId(),
      releaseId: ultimo.id,
      prefeituraId: sec.prefeituraId,
      url: b.url ?? null,
      legenda: b.legenda ?? null,
    });
    return NextResponse.json({ ok: true, vinculadoA: ultimo.id, acao: "anexada" });
  }

  // Sem contexto recente → cria item aguardando assunto
  const foraJanela = !!ultimo && !recente;
  const askMsg = foraJanela
    ? `📷 Recebi sua foto, ${sec.nome.split(" ")[0]}! Como já faz um tempo desde a sua última mensagem, me confirma sobre qual assunto ela é. 🙂`
    : `📷 Recebi sua foto, ${sec.nome.split(" ")[0]}! Sobre qual assunto é? Me manda um áudio ou texto explicando a ação, que eu preparo o release com a foto junto. 🎙️`;

  const releaseId = newId();
  await db.insert(releases).values({
    id: releaseId,
    prefeituraId: sec.prefeituraId,
    secretarioId: sec.id,
    secretarioNome: sec.nome,
    secretaria: sec.secretaria,
    origem: "foto",
    status: "aguardando",
    aguardando: true,
    askMsg,
    caso: foraJanela ? "fora-janela" : "sem-contexto",
  });
  await db.insert(fotos).values({
    id: newId(),
    releaseId,
    prefeituraId: sec.prefeituraId,
    url: b.url ?? null,
    legenda: b.legenda ?? null,
  });

  return NextResponse.json({ ok: true, releaseId, acao: "aguardando", askMsg });
}
