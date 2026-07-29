import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { CopiarTexto } from "./CopiarTexto";

const TIPO_LABEL: Record<string, string> = {
  requerimento: "Requerimento",
  projeto_lei: "Projeto de lei",
  discurso: "Discurso",
  materia: "Matéria",
  outro: "Outro",
};
const CANAL_LABEL: Record<string, string> = { audio: "por áudio", texto: "por texto" };

type Atividade = {
  id: string;
  tipo: string;
  canal: string;
  titulo: string;
  resumo: string | null;
  conteudo: string;
  created_at: string;
};

function quando(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Etiqueta({ tipo }: { tipo: string }) {
  return (
    <span className="rounded-full bg-success-100 px-2.5 py-0.5 text-xs font-medium text-brand-700">
      {TIPO_LABEL[tipo] ?? tipo}
    </span>
  );
}

/** Cartão da lista. No desktop vira item selecionável da coluna da esquerda. */
function ItemLista({ a, ativo }: { a: Atividade; ativo: boolean }) {
  return (
    <Link
      href={`/atividade?doc=${a.id}`}
      scroll={false}
      className={`block rounded-2xl border p-4 transition ${
        ativo
          ? "border-brand-700/30 bg-white shadow-sm md:ring-1 md:ring-brand-700/20"
          : "border-sand-200 bg-white hover:border-sand-300"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Etiqueta tipo={a.tipo} />
        <span className="text-xs text-ink-400">
          {quando(a.created_at)} · {CANAL_LABEL[a.canal] ?? a.canal}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 font-medium text-ink-900">{a.titulo}</p>
      {a.resumo ? <p className="mt-1 line-clamp-2 text-sm text-ink-500">{a.resumo}</p> : null}
    </Link>
  );
}

/** Documento aberto: texto completo, pronto para revisar e copiar. */
function Leitura({ a }: { a: Atividade }) {
  return (
    <article className="rounded-2xl border border-sand-200 bg-white">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-sand-200 p-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Etiqueta tipo={a.tipo} />
            <span className="text-xs text-ink-400">
              {quando(a.created_at)} · {CANAL_LABEL[a.canal] ?? a.canal}
            </span>
          </div>
          <h2 className="mt-2 font-medium text-ink-900">{a.titulo}</h2>
        </div>
        <CopiarTexto texto={a.conteudo} />
      </header>
      <div className="p-5">
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink-700">{a.conteudo}</p>
      </div>
    </article>
  );
}

export default async function AtividadePage({
  searchParams,
}: {
  searchParams: Promise<{ doc?: string }>;
}) {
  const { doc } = await searchParams;
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("atividades_whatsapp")
    .select("id, tipo, canal, titulo, resumo, conteudo, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const atividades = (data ?? []) as Atividade[];
  // No desktop sempre há algo aberto à direita; no celular, só quando o
  // assessor toca num item (aí a lista dá lugar à leitura).
  const aberta = atividades.find((a) => a.id === doc) ?? atividades[0] ?? null;

  if (atividades.length === 0) {
    return (
      <div className="mx-auto max-w-md px-5 pt-8 md:max-w-2xl md:px-8">
        <h1 className="font-serif text-4xl text-ink-900">Atividade</h1>
        <div className="mt-6 rounded-2xl border border-sand-200 bg-white p-8 text-center">
          <p className="text-sm text-ink-500">
            Nada gerado ainda. Peça um requerimento, discurso ou matéria pelo WhatsApp que ele
            aparece aqui.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-5 pt-8 md:max-w-6xl md:px-8">
      <div className={doc ? "hidden md:block" : "block"}>
        <h1 className="font-serif text-4xl text-ink-900">Atividade</h1>
        <p className="mt-1 text-sm text-ink-500">
          Tudo que foi gerado pelo WhatsApp, mais recente primeiro.
        </p>
      </div>

      <div className="mt-6 gap-6 md:grid md:grid-cols-[21rem_1fr] md:items-start">
        {/* Lista — no celular some quando um documento está aberto */}
        <div className={`space-y-3 md:sticky md:top-6 md:max-h-[calc(100dvh-6rem)] md:overflow-y-auto md:pr-1 ${doc ? "hidden md:block" : "block"}`}>
          {atividades.map((a) => (
            <ItemLista key={a.id} a={a} ativo={a.id === aberta?.id} />
          ))}
        </div>

        {/* Leitura — no celular ocupa a tela toda, com voltar */}
        <div className={doc ? "block" : "hidden md:block"}>
          <Link
            href="/atividade"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 md:hidden"
          >
            <ArrowLeft size={16} /> Todos os documentos
          </Link>
          {aberta ? <Leitura a={aberta} /> : null}
        </div>
      </div>
    </div>
  );
}
