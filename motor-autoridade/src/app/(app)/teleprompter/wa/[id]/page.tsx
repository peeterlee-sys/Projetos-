import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { zapcapConfigured } from "@/lib/zapcap/client";
import { limparMarcadores } from "@/lib/atividades/limpar";
import { tituloDeExibicao } from "@/lib/atividades/titulo";
import Teleprompter from "../../Teleprompter";

/**
 * Teleprompter de um documento gerado no WhatsApp.
 *
 * Fecha o ciclo no celular do vereador: ele pede o discurso pelo WhatsApp,
 * abre o app, lê na rolagem e grava ali mesmo. A rota irmã `[id]` faz o mesmo
 * para o Take, mas lê de `content_items`, que é tabela do outro produto e não
 * tem nada do que é gerado aqui.
 *
 * O conteúdo passa por `limparMarcadores`: o texto é gravado com os "(1/3)" da
 * entrega picotada do WhatsApp, e isso não pode ir para a rolagem.
 */
export default async function TeleprompterDaAtividade({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  // A RLS da tabela já restringe ao dono e ao admin do tenant.
  const { data: atividade } = await supabase
    .from("atividades_whatsapp")
    .select("id, titulo, conteudo")
    .eq("id", id)
    .maybeSingle();
  if (!atividade) notFound();

  const roteiro = limparMarcadores(atividade.conteudo);

  return (
    <Teleprompter
      initialScript={roteiro}
      title={tituloDeExibicao(atividade.titulo, roteiro)}
      backHref={`/atividade?doc=${atividade.id}`}
      backLabel="Documento"
      captionsEnabled={zapcapConfigured()}
    />
  );
}
