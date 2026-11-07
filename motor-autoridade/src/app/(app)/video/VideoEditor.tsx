"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Download,
  Clock,
} from "lucide-react";
import { createClient as createBrowserClient } from "@/lib/supabase/browser";
import { estimarSegundosDeEnvio, formatarDuracao, subirComProgresso } from "@/lib/video/upload";

/**
 * Edição do vídeo que o vereador grava no celular e sobe pelo painel.
 *
 * Só o envio exige o app aberto — depois dele o pedido vira registro no banco
 * e o servidor termina sozinho. Antes o vereador precisava ficar olhando a
 * tela por minutos e perdia tudo se trocasse de aplicativo.
 */

/**
 * Teto por arquivo do Storage. O plano Free do Supabase trava em 50MB e não
 * deixa configurar; o Pro permite até 500GB.
 *
 * Fica em variável de ambiente para subir o teto na hora da troca de plano,
 * sem mexer em código: basta definir NEXT_PUBLIC_VIDEO_LIMITE_MB e publicar.
 *
 * Importa recusar aqui, antes de começar: o servidor recusa o arquivo grande
 * só depois de recebê-lo inteiro, e o vereador passa minutos olhando a barra
 * subir para no fim não dar em nada.
 */
const LIMITE_MB = Number(process.env.NEXT_PUBLIC_VIDEO_LIMITE_MB) || 50;

type Estado = "idle" | "enviando" | "enfileirado" | "falhou";

type Job = {
  id: string;
  nome_origem: string;
  status: "pendente" | "cortando" | "legendando" | "pronto" | "falhou";
  erro: string | null;
  url: string | null;
  duracao_original: number | null;
  duracao_final: number | null;
  cortes: number | null;
  excede_whatsapp: boolean;
  created_at: string;
};

const ROTULO: Record<Job["status"], string> = {
  pendente: "Na fila",
  cortando: "Cortando as pausas",
  legendando: "Gerando as legendas",
  pronto: "Pronto",
  falhou: "Falhou",
};

const EM_ANDAMENTO: Job["status"][] = ["pendente", "cortando", "legendando"];

export function VideoEditor({ legendasDisponiveis }: { legendasDisponiveis: boolean }) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [cortarPausas, setCortarPausas] = useState(true);
  const [legendar, setLegendar] = useState(legendasDisponiveis);
  const [estado, setEstado] = useState<Estado>("idle");
  const [porcento, setPorcento] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const pollRef = useRef<number | null>(null);

  const carregarJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/video/jobs");
      if (!res.ok) return;
      const j = await res.json();
      setJobs(j.jobs ?? []);
    } catch {
      /* rede instável: a próxima passada tenta de novo */
    }
  }, []);

  // Enquanto houver pedido andando, atualiza sozinho. Quando tudo termina o
  // relógio para — sem isso o app ficaria consultando o servidor à toa.
  useEffect(() => {
    const andando = jobs.some((j) => EM_ANDAMENTO.includes(j.status));
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (!andando) return;
    pollRef.current = window.setInterval(carregarJobs, 5000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [jobs, carregarJobs]);

  useEffect(() => {
    void carregarJobs();
  }, [carregarJobs]);

  const enviar = useCallback(async () => {
    if (!arquivo) return;
    setErro(null);
    setPorcento(0);
    setEstado("enviando");
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) throw new Error("Sessão expirada. Faça login novamente.");

      const ext = arquivo.name.split(".").pop()?.toLowerCase() || "mp4";
      const caminho = `${session.user.id}/${Date.now()}.${ext}`;

      await subirComProgresso({
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
        accessToken: session.access_token,
        bucket: "recordings",
        caminho,
        arquivo,
        aoProgredir: (p) => setPorcento(p.porcento),
      });

      const res = await fetch("/api/video/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: caminho,
          nome: arquivo.name,
          cortar: cortarPausas,
          legendar: legendar && legendasDisponiveis,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Não foi possível registrar o pedido.");

      setEstado("enfileirado");
      setArquivo(null);
      await carregarJobs();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha no envio do vídeo.");
      setEstado("falhou");
    }
  }, [arquivo, cortarPausas, legendar, legendasDisponiveis, carregarJobs]);

  const escolher = useCallback((f: File | null) => {
    setEstado("idle");
    setErro(null);
    if (f && f.size > LIMITE_MB * 1024 * 1024) {
      setArquivo(null);
      setErro(
        `Este vídeo tem ${(f.size / 1024 / 1024).toFixed(0)}MB e o limite é ${LIMITE_MB}MB. ` +
          "Grave um trecho mais curto, ou baixe a qualidade da câmera do celular " +
          "(no iPhone: Ajustes → Câmera → Gravar Vídeo → 720p HD, 30 fps). " +
          "Em 720p um minuto de vídeo fica em torno de 15MB."
      );
      return;
    }
    setArquivo(f);
  }, []);

  const enviando = estado === "enviando";
  const nadaMarcado = !cortarPausas && !legendar;

  return (
    <div className="space-y-4">
      <label
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition ${
          enviando ? "pointer-events-none opacity-50" : "border-sand-200 hover:border-brand-700/40"
        }`}
      >
        <Upload size={26} className="text-brand-700" strokeWidth={1.8} />
        <span className="text-sm font-medium text-ink-900">
          {arquivo ? arquivo.name : "Escolher vídeo da galeria"}
        </span>
        <span className="text-xs text-ink-500">
          {arquivo
            ? `${(arquivo.size / 1024 / 1024).toFixed(0)}MB · envio de cerca de ${formatarDuracao(
                estimarSegundosDeEnvio(arquivo.size)
              )}`
            : `MP4 ou MOV, até ${LIMITE_MB}MB — cerca de ${Math.round(LIMITE_MB / 15)} min em 720p`}
        </span>
        <input
          type="file"
          accept="video/*"
          className="hidden"
          disabled={enviando}
          onChange={(e) => escolher(e.target.files?.[0] ?? null)}
        />
      </label>

      {arquivo && (
        <>
          <label className="flex items-start gap-3 rounded-2xl bg-white p-4 ring-1 ring-sand-200">
            <input
              type="checkbox"
              checked={cortarPausas}
              disabled={enviando}
              onChange={(e) => setCortarPausas(e.target.checked)}
              className="mt-0.5 size-4 accent-brand-700"
            />
            <span className="text-sm text-ink-900">
              Cortar pausas e respiração
              <span className="block text-xs text-ink-500">
                Remove os silêncios longos. Costuma encurtar o vídeo em cerca de um terço.
              </span>
            </span>
          </label>

          <label
            className={`flex items-start gap-3 rounded-2xl bg-white p-4 ring-1 ring-sand-200 ${
              legendasDisponiveis ? "" : "opacity-60"
            }`}
          >
            <input
              type="checkbox"
              checked={legendar}
              disabled={enviando || !legendasDisponiveis}
              onChange={(e) => setLegendar(e.target.checked)}
              className="mt-0.5 size-4 accent-brand-700"
            />
            <span className="text-sm text-ink-900">
              Queimar legendas no vídeo
              <span className="block text-xs text-ink-500">
                {legendasDisponiveis
                  ? "Transcreve a fala e grava a legenda na imagem."
                  : "Indisponível: falta configurar a chave de legendas nesta conta. O corte funciona normalmente."}
              </span>
            </span>
          </label>

          <button
            type="button"
            onClick={enviar}
            disabled={enviando || nadaMarcado}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-700 px-5 py-3 text-sm font-medium text-sand-50 transition hover:bg-brand-800 disabled:opacity-60"
          >
            {enviando && <Loader2 size={16} className="animate-spin" />}
            {enviando
              ? `Enviando ${porcento}%`
              : nadaMarcado
                ? "Escolha o que fazer com o vídeo"
                : "Enviar para edição"}
          </button>
        </>
      )}

      {enviando && (
        <div className="space-y-2 rounded-2xl bg-white p-4 ring-1 ring-sand-200">
          <div className="h-1.5 overflow-hidden rounded-full bg-sand-200">
            <div
              className="h-full rounded-full bg-brand-700 transition-[width] duration-300"
              style={{ width: `${Math.max(2, porcento)}%` }}
            />
          </div>
          <p className="text-xs text-ink-500">
            Mantenha o app aberto só até o envio terminar. Depois disso pode fechar.
          </p>
        </div>
      )}

      {estado === "enfileirado" && (
        <p className="flex items-start gap-2 rounded-2xl bg-white p-4 text-sm text-ink-900 ring-1 ring-brand-700/20">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-brand-700" strokeWidth={2} />
          Vídeo recebido. <strong>Pode fechar o app</strong> — ele continua sendo editado e aparece
          aqui pronto quando você voltar.
        </p>
      )}

      {erro && (
        <p className="flex items-start gap-2 rounded-2xl bg-white p-4 text-sm text-ink-900 ring-1 ring-sand-200">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-600" strokeWidth={1.8} />
          {erro}
        </p>
      )}

      {jobs.length > 0 && (
        <section className="space-y-2 pt-2">
          <h2 className="px-1 text-[11px] font-bold uppercase tracking-wider text-ink-400">
            Seus vídeos
          </h2>
          {jobs.map((j) => (
            <CartaoJob key={j.id} job={j} />
          ))}
        </section>
      )}
    </div>
  );
}

function CartaoJob({ job }: { job: Job }) {
  const andando = EM_ANDAMENTO.includes(job.status);

  return (
    <article className="space-y-2 rounded-2xl bg-white p-4 ring-1 ring-sand-200">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900">
          {job.nome_origem}
        </p>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-medium ${
            job.status === "pronto"
              ? "text-brand-700"
              : job.status === "falhou"
                ? "text-red-600"
                : "text-ink-500"
          }`}
        >
          {andando && <Loader2 size={13} className="animate-spin" />}
          {job.status === "pronto" && <CheckCircle2 size={13} strokeWidth={2.2} />}
          {job.status === "falhou" && <AlertCircle size={13} strokeWidth={2.2} />}
          {ROTULO[job.status]}
        </span>
      </div>

      {andando && (
        <p className="flex items-center gap-1.5 text-xs text-ink-500">
          <Clock size={12} strokeWidth={1.9} />
          Pode fechar o app; o trabalho segue no servidor.
        </p>
      )}

      {job.status === "falhou" && job.erro && (
        <p className="text-xs text-ink-500">{job.erro}</p>
      )}

      {job.status === "pronto" && job.cortes ? (
        <p className="text-xs text-ink-500">
          {job.cortes} {job.cortes === 1 ? "pausa removida" : "pausas removidas"} — de{" "}
          {job.duracao_original}s para{" "}
          <strong className="text-ink-900">{job.duracao_final}s</strong>.
        </p>
      ) : null}

      {job.status === "pronto" && job.excede_whatsapp && (
        <p className="text-xs text-ink-500">
          Ficou grande demais para enviar pelo WhatsApp. Baixe aqui e publique direto na rede.
        </p>
      )}

      {job.status === "pronto" && job.url && (
        <>
          <video src={job.url} controls playsInline className="w-full rounded-xl bg-black" />
          <a
            href={job.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-700 px-5 py-3 text-sm font-medium text-sand-50 transition hover:bg-brand-800"
          >
            <Download size={16} strokeWidth={1.9} />
            Baixar vídeo
          </a>
        </>
      )}
    </article>
  );
}
