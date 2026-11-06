import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { processarJob } from "@/lib/video/jobs";

export const runtime = "nodejs";

/** Teto do plano Pro: o corte cabe de sobra, e sobra espera para a legenda. */
export const maxDuration = 300;

const corpo = z.object({
  path: z.string().min(1).max(300),
  nome: z.string().min(1).max(200),
  cortar: z.boolean(),
  legendar: z.boolean(),
});

/**
 * Cria o pedido de edição e devolve na hora.
 *
 * O processamento segue em `after()`, que o Next executa depois da resposta
 * já ter saído. É o que permite o vereador fechar o app: a resposta não
 * espera o ffmpeg, e o estado vive no banco, não na aba aberta.
 *
 * Se a função morrer no meio, o cron de vídeo retoma o pedido de onde parou.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !user.tenant_id) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  }

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
  if (!dados.cortar && !dados.legendar) {
    return NextResponse.json({ error: "Escolha pelo menos uma edição." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: job, error } = await supabase
    .from("video_jobs")
    .insert({
      tenant_id: user.tenant_id,
      user_id: user.id,
      nome_origem: dados.nome,
      source_path: dados.path,
      cortar: dados.cortar,
      legendar: dados.legendar,
    })
    .select("id")
    .single();

  if (error || !job) {
    return NextResponse.json({ error: "Não foi possível registrar o pedido." }, { status: 500 });
  }

  after(async () => {
    await processarJob(supabase, job.id);
  });

  return NextResponse.json({ job_id: job.id, status: "pendente" });
}

/** Lista os pedidos recentes do vereador, para a tela mostrar o andamento. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });

  const supabase = await createClient();
  const { data } = await supabase
    .from("video_jobs")
    .select(
      "id, nome_origem, status, erro, output_path, duracao_original, duracao_final, cortes, excede_whatsapp, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(10);

  // A URL do bucket é assinada e expira, então é gerada a cada consulta em vez
  // de guardada na tabela.
  const jobs = await Promise.all(
    (data ?? []).map(async (j) => {
      let url: string | null = null;
      if (j.status === "pronto" && j.output_path) {
        const r = await supabase.storage.from("recordings").createSignedUrl(j.output_path, 3600);
        url = r.data?.signedUrl ?? null;
      }
      return { ...j, url };
    })
  );

  return NextResponse.json({ jobs });
}
