import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { CopiarTexto } from "./CopiarTexto";
import { dividirEmSecoes } from "@/lib/atividades/secoes";
import { estiloDe, ORDEM_TIPOS, TIPOS } from "@/lib/atividades/tipos";

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
  const e = estiloDe(tipo);
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ color: e.cor, background: e.fundo }}
    >
      {e.label}
    </span>
  );
}

/** Item da coluna da esquerda. A borda colorida identifica o tipo de relance. */
function ItemLista({ a, ativo }: { a: Atividade; ativo: boolean }) {
  const e = estiloDe(a.tipo);
  return (
    <Link
      href={`/atividade?doc=${a.id}`}
      scroll={false}
      className={`block rounded-xl bg-white p-4 transition ${
        ativo ? "shadow-sm ring-1 ring-sand-300" : "hover:shadow-sm"
      }`}
      style={{ borderLeft: `4px solid ${e.cor}` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Etiqueta tipo={a.tipo} />
        <span className="text-xs text-ink-400">
          {quando(a.created_at)} · {CANAL_LABEL[a.canal] ?? a.canal}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 font-medium text-ink-900">{a.titulo}</p>
    </Link>
  );
}

/**
 * Documento aberto. Quando a IA gerou seções (headline, release, legenda de
 * Instagram, texto de WhatsApp), cada uma vira um bloco com o próprio botão de
 * copiar — é o que o assessor faz na prática: cada peça vai para um canal.
 */
function Leitura({ a }: { a: Atividade }) {
  const e = estiloDe(a.tipo);
  const secoes = dividirEmSecoes(a.conteudo);

  return (
    <article className="overflow-hidden rounded-2xl bg-white ring-1 ring-sand-200">
      <header className="p-5" style={{ background: e.fundo }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Etiqueta tipo={a.tipo} />
              <span className="text-xs text-ink-500">
                {quando(a.created_at)} · {CANAL_LABEL[a.canal] ?? a.canal}
              </span>
            </div>
            <h2 className="mt-2 font-medium" style={{ color: e.cor }}>
              {a.titulo}
            </h2>
          </div>
          <CopiarTexto texto={a.conteudo} rotulo="Copiar tudo" cor={e.cor} />
        </div>
      </header>

      {secoes.length > 0 ? (
        <div className="divide-y divide-sand-200">
          {secoes.map((s, i) => (
            <section key={i} className="p-5">
              {s.titulo ? (
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3
                    className="text-[11px] font-bold uppercase tracking-wider"
                    style={{ color: e.cor }}
                  >
                    {s.titulo}
                  </h3>
                  <CopiarTexto texto={s.conteudo} rotulo="Copiar" discreto cor={e.cor} />
                </div>
              ) : null}
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink-700">
                {s.conteudo}
              </p>
            </section>
          ))}
        </div>
      ) : (
        <div className="p-5">
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink-700">
            {a.conteudo}
          </p>
        </div>
      )}
    </article>
  );
}

/** Filtro por tipo, com a contagem de cada um. */
function Filtros({ contagem, ativo }: { contagem: Record<string, number>; ativo?: string }) {
  const total = Object.values(contagem).reduce((s, n) => s + n, 0);
  const itens = [
    { tipo: "", label: "Tudo", n: total, cor: "#101d3a", fundo: "#e2e7f0" },
    ...ORDEM_TIPOS.filter((t) => contagem[t] > 0).map((t) => ({
      tipo: t as string,
      label: TIPOS[t].label,
      n: contagem[t],
      cor: TIPOS[t].cor,
      fundo: TIPOS[t].fundo,
    })),
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {itens.map((i) => {
        const selecionado = (ativo ?? "") === i.tipo;
        return (
          <Link
            key={i.tipo || "tudo"}
            href={i.tipo ? `/atividade?tipo=${i.tipo}` : "/atividade"}
            className="rounded-full px-3 py-1.5 text-xs font-semibold transition hover:opacity-85"
            style={
              selecionado
                ? { background: i.cor, color: "#fff" }
                : { background: i.fundo, color: i.cor }
            }
          >
            {i.label} <span className="opacity-70">{i.n}</span>
          </Link>
        );
      })}
    </div>
  );
}

export default async function AtividadePage({
  searchParams,
}: {
  searchParams: Promise<{ doc?: string; tipo?: string }>;
}) {
  const { doc, tipo } = await searchParams;
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("atividades_whatsapp")
    .select("id, tipo, canal, titulo, resumo, conteudo, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const todas = (data ?? []) as Atividade[];
  const contagem: Record<string, number> = {};
  for (const a of todas) contagem[a.tipo] = (contagem[a.tipo] ?? 0) + 1;

  const atividades = tipo ? todas.filter((a) => a.tipo === tipo) : todas;
  // No desktop sempre há algo aberto à direita; no celular, só quando o
  // assessor toca num item (aí a lista dá lugar à leitura).
  const aberta = atividades.find((a) => a.id === doc) ?? atividades[0] ?? null;

  return (
    <main className="mx-auto max-w-md px-5 pt-8 md:max-w-6xl md:px-8">
      <div className={doc ? "hidden md:block" : "block"}>
        <h1 className="font-serif text-4xl text-ink-900">Atividade</h1>
        <p className="mt-1 text-sm text-ink-500">
          Tudo que foi gerado pelo WhatsApp, mais recente primeiro.
        </p>
        {todas.length > 0 ? (
          <div className="mt-4">
            <Filtros contagem={contagem} ativo={tipo} />
          </div>
        ) : null}
      </div>

      {atividades.length === 0 ? (
        <div className="mt-6 rounded-2xl bg-white p-8 text-center ring-1 ring-sand-200">
          <p className="text-sm text-ink-500">
            {todas.length === 0
              ? "Nada gerado ainda. Peça um requerimento, discurso ou matéria pelo WhatsApp que ele aparece aqui."
              : "Nenhum documento desse tipo ainda."}
          </p>
        </div>
      ) : (
        <div className="mt-5 gap-6 md:grid md:grid-cols-[22rem_1fr] md:items-start">
          <div
            className={`space-y-3 md:sticky md:top-6 md:max-h-[calc(100dvh-6rem)] md:overflow-y-auto md:pr-1 ${
              doc ? "hidden md:block" : "block"
            }`}
          >
            {atividades.map((a) => (
              <ItemLista key={a.id} a={a} ativo={a.id === aberta?.id} />
            ))}
          </div>

          <div className={doc ? "block" : "hidden md:block"}>
            <Link
              href={tipo ? `/atividade?tipo=${tipo}` : "/atividade"}
              className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 md:hidden"
            >
              <ArrowLeft size={16} /> Todos os documentos
            </Link>
            {aberta ? <Leitura a={aberta} /> : null}
          </div>
        </div>
      )}
    </main>
  );
}
