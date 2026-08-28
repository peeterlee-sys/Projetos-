import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { secretarios, releases, contextos, fotos } from "@/lib/db/schema";
import { normTel, telVariants, newId, badRequest } from "@/lib/http";
import { transcribe, generate } from "@/lib/ai";

/**
 * Webhook único do WhatsApp — "o painel faz o trabalho".
 * O Make só entrega a mensagem crua e devolve o `reply` pro secretário.
 *
 * Header obrigatório: x-webhook-secret
 * body: {
 *   telefone: string,
 *   tipo: "audio" | "texto" | "imagem",
 *   texto?: string,       // texto digitado OU legenda descrevendo o assunto
 *   audioUrl?: string,    // URL do áudio (quando tipo = audio)
 *   imagemUrl?: string,   // URL da foto (quando tipo = imagem)
 * }
 *
 * resposta: { ok, reply, releaseId?, cadastrado? }
 *  - `reply` é o texto que o Make deve mandar de volta no WhatsApp.
 */

const JANELA_MS = 2 * 60 * 60 * 1000; // 2 horas

function authorized(req: Request): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  return !!secret && req.headers.get("x-webhook-secret") === secret;
}

async function baixarImagem(
  url: string,
): Promise<{ base64: string; mediaType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`falha ao baixar imagem (${res.status})`);
  const ct = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
  const mediaType = /^image\/(jpeg|png|gif|webp)$/.test(ct) ? ct : "image/jpeg";
  const base64 = Buffer.from(await res.arrayBuffer()).toString("base64");
  return { base64, mediaType };
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const b = await req.json().catch(() => ({}));
  const telefone = normTel(b.telefone ?? "");
  if (!telefone) return badRequest("telefone obrigatório");

  // O texto pode vir cru (`texto`) ou em base64 (`texto_b64`). O Make manda em
  // base64 pra não quebrar o JSON quando a transcrição tem aspas/quebras de linha.
  const textoRecebido = (): string => {
    if (b.texto_b64) {
      try {
        return Buffer.from(String(b.texto_b64), "base64").toString("utf8").trim();
      } catch {
        return "";
      }
    }
    return String(b.texto ?? "").trim();
  };

  const tipo: "audio" | "texto" | "imagem" =
    b.tipo === "audio" || b.tipo === "imagem" ? b.tipo : "texto";

  // 1) Identifica o secretário (define a prefeitura).
  const [sec] = await db
    .select()
    .from(secretarios)
    .where(
      and(
        inArray(secretarios.telefone, telVariants(b.telefone)),
        eq(secretarios.ativo, true),
      ),
    )
    .limit(1);

  if (!sec) {
    return NextResponse.json({
      ok: true,
      cadastrado: false,
      reply:
        "Olá! Não encontrei o seu número no nosso cadastro. Peça à equipe de comunicação da prefeitura para te cadastrar no painel. 🙂",
    });
  }

  const primeiro = sec.nome.split(" ")[0];

  // 2) Carrega o contexto da prefeitura (anamnese).
  const [ctx] = await db
    .select()
    .from(contextos)
    .where(eq(contextos.prefeituraId, sec.prefeituraId))
    .limit(1);

  // Último release do secretário (para janela de 2h / foto pendente).
  const [ultimo] = await db
    .select()
    .from(releases)
    .where(eq(releases.secretarioId, sec.id))
    .orderBy(desc(releases.criadoEm))
    .limit(1);
  const recente =
    ultimo && ultimo.criadoEm && Date.now() - ultimo.criadoEm.getTime() <= JANELA_MS;
  const aguardandoFoto = !!(recente && ultimo.aguardando);

  try {
    // 3a) IMAGEM sem assunto → pede contexto (igual ao fluxo antigo de mídia).
    if (tipo === "imagem" && !textoRecebido()) {
      const foraJanela = !!ultimo && !recente;

      // Já existe um release recente com texto? Anexa a foto nele.
      if (recente && !ultimo.aguardando) {
        await db.insert(fotos).values({
          id: newId(),
          releaseId: ultimo.id,
          prefeituraId: sec.prefeituraId,
          url: b.imagemUrl ?? null,
          legenda: null,
        });
        return NextResponse.json({
          ok: true,
          releaseId: ultimo.id,
          reply: `📷 Recebi a foto, ${primeiro}! Anexei ela ao release mais recente. 👍`,
        });
      }

      const askMsg = foraJanela
        ? `📷 Recebi sua foto, ${primeiro}! Como já faz um tempo desde a sua última mensagem, me confirma sobre qual assunto ela é. 🙂`
        : `📷 Recebi sua foto, ${primeiro}! Sobre qual assunto é? Me manda um áudio ou texto explicando a ação, que eu preparo o release com a foto junto. 🎙️`;

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
        url: b.imagemUrl ?? null,
        legenda: null,
      });
      return NextResponse.json({ ok: true, releaseId, reply: askMsg });
    }

    // 3b) Monta a mensagem-base (transcreve áudio se preciso).
    let mensagem = "";
    let origem: "audio" | "texto" | "foto" = "texto";
    if (tipo === "audio") {
      if (!b.audioUrl) return badRequest("audioUrl obrigatório para áudio");
      mensagem = await transcribe(String(b.audioUrl));
      origem = "audio";
    } else if (tipo === "imagem") {
      mensagem = textoRecebido();
      origem = "foto";
    } else {
      mensagem = textoRecebido();
      origem = "texto";
    }
    if (!mensagem) return badRequest("mensagem vazia");

    // Foto anexa (imagem nova com assunto, ou foto que estava aguardando).
    let imagem: { base64: string; mediaType: string } | null = null;
    if (tipo === "imagem" && b.imagemUrl) {
      imagem = await baixarImagem(String(b.imagemUrl));
    }

    // 4) Gera o release com a IA usando o contexto da prefeitura.
    const gerado = await generate({
      ctx: ctx ?? null,
      secretario: sec,
      mensagem,
      imagem,
    });

    // 5) Salva. Se havia uma foto aguardando assunto, completa aquele release.
    let releaseId: string;
    if (aguardandoFoto) {
      releaseId = ultimo.id;
      await db
        .update(releases)
        .set({
          origem: "foto",
          transcricao: mensagem,
          headline: gerado.headline,
          release: gerado.release,
          instagram: gerado.instagram,
          status: "pendente",
          aguardando: false,
          askMsg: null,
          atualizadoEm: new Date(),
        })
        .where(eq(releases.id, releaseId));
    } else {
      releaseId = newId();
      await db.insert(releases).values({
        id: releaseId,
        prefeituraId: sec.prefeituraId,
        secretarioId: sec.id,
        secretarioNome: sec.nome,
        secretaria: sec.secretaria,
        origem,
        transcricao: mensagem,
        headline: gerado.headline,
        release: gerado.release,
        instagram: gerado.instagram,
        status: "pendente",
      });
    }

    if (tipo === "imagem" && b.imagemUrl) {
      await db.insert(fotos).values({
        id: newId(),
        releaseId,
        prefeituraId: sec.prefeituraId,
        url: String(b.imagemUrl),
        legenda: null,
      });
    }

    return NextResponse.json({
      ok: true,
      releaseId,
      reply: `✅ Prontinho, ${primeiro}! Preparei o release "${gerado.headline}" e ele já está no painel da equipe de comunicação para revisão e publicação. 📝`,
    });
  } catch (err) {
    console.error("[webhook/whatsapp]", err);
    return NextResponse.json(
      {
        ok: false,
        reply: `Ops, ${primeiro}, tive um problema técnico pra processar sua mensagem agora. Pode tentar de novo em instantes? 🙏`,
      },
      { status: 500 },
    );
  }
}
