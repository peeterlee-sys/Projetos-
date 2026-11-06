import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { LIMITE_ENTRADA_MB, cortarSilencio } from "@/lib/video/executar";

export const runtime = "nodejs";

/**
 * Teto do plano Pro. O corte de 2 minutos de vídeo mediu ~15s nos testes, então
 * sobra folga larga; o teto está alto para o vídeo longo não morrer no meio.
 */
export const maxDuration = 300;

const corpo = z.object({ path: z.string().min(1).max(300) });

/**
 * Corta as pausas do vídeo que o assessor subiu pelo painel.
 *
 * Recebe o caminho no Storage (não o arquivo) para o vídeo não passar duas
 * vezes pela rede: ele já está no bucket, a função baixa de lá, corta e grava
 * o resultado ao lado.
 *
 * O arquivo cortado é o que segue para as legendas — cortar depois de legendar
 * deixaria legenda fora de sincronia com a fala.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });

  let dados: z.infer<typeof corpo>;
  try {
    dados = corpo.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  // O caminho sempre começa com o id do usuário: impede pedir o vídeo de outro.
  if (!dados.path.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "Vídeo não encontrado." }, { status: 404 });
  }

  const supabase = await createClient();

  const baixado = await supabase.storage.from("recordings").download(dados.path);
  if (baixado.error || !baixado.data) {
    return NextResponse.json({ error: "Não foi possível abrir o vídeo." }, { status: 404 });
  }

  const entrada = Buffer.from(await baixado.data.arrayBuffer());
  if (entrada.byteLength > LIMITE_ENTRADA_MB * 1024 * 1024) {
    return NextResponse.json(
      { error: `O vídeo passa de ${LIMITE_ENTRADA_MB}MB e não cabe no processamento.` },
      { status: 413 }
    );
  }

  try {
    const r = await cortarSilencio(entrada);
    const destino = dados.path.replace(/(\.[^.]+)?$/, "") + "-cortado.mp4";

    const subida = await supabase.storage
      .from("recordings")
      .upload(destino, r.arquivo, { contentType: "video/mp4", upsert: true });
    if (subida.error) throw new Error("Falha ao guardar o vídeo cortado.");

    const assinada = await supabase.storage.from("recordings").createSignedUrl(destino, 3600);
    if (!assinada.data?.signedUrl) throw new Error("Falha ao preparar o vídeo cortado.");

    return NextResponse.json({
      path: destino,
      url: assinada.data.signedUrl,
      duracao_original: Math.round(r.duracaoOriginal),
      duracao_final: Math.round(r.duracaoFinal),
      cortes: r.trechos,
      excede_whatsapp: r.excedeWhatsApp,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao cortar o vídeo.";
    await supabase
      .from("system_errors")
      .insert({ scope: "video", message, context: { path: dados.path } });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
