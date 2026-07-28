import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";

const TIPO_LABEL: Record<string, string> = {
  requerimento: "Requerimento",
  projeto_lei: "Projeto de lei",
  discurso: "Discurso",
  materia: "Matéria",
  outro: "Outro",
};
const CANAL_LABEL: Record<string, string> = {
  audio: "por áudio",
  texto: "por texto",
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Aba "Atividade": tudo que o vereador (ou o assessor, com a mesma senha)
 * gerou pelo WhatsApp — requerimento, projeto de lei, discurso, matéria.
 * Sem métricas de gamificação: é só o registro do que já foi feito, pra
 * o assessor abrir, corrigir e publicar.
 */
export default async function AtividadePage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: atividades } = await supabase
    .from("atividades_whatsapp")
    .select("id, tipo, canal, titulo, resumo, conteudo, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <main className="px-5 pt-8 pb-8">
      <h1 className="mb-1 font-serif text-4xl text-ink-900">Atividade</h1>
      <p className="mb-5 text-sm text-ink-500">
        Tudo que foi gerado pelo WhatsApp, mais recente primeiro.
      </p>

      {!atividades || atividades.length === 0 ? (
        <div className="rounded-[24px] bg-white p-6 text-center ring-1 ring-sand-200">
          <p className="text-sm text-ink-500">
            Nada gerado ainda. Peça um requerimento, discurso ou matéria pelo WhatsApp
            que ele aparece aqui.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {atividades.map((a) => (
            <li key={a.id} className="rounded-[24px] bg-white p-5 ring-1 ring-sand-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-full bg-success-100 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                  {TIPO_LABEL[a.tipo] ?? a.tipo}
                </span>
                <span className="text-xs text-ink-400">
                  {fmt(a.created_at)} · {CANAL_LABEL[a.canal] ?? a.canal}
                </span>
              </div>
              <p className="mt-2 font-medium text-ink-900">{a.titulo}</p>
              {a.resumo ? <p className="mt-1 text-sm text-ink-500">{a.resumo}</p> : null}
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-brand-700">Ver texto completo</summary>
                <p className="mt-2 whitespace-pre-wrap text-ink-700">{a.conteudo}</p>
              </details>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
