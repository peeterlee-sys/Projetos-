"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Loader2, CheckCircle2, AlertCircle, Download } from "lucide-react";
import { createClient as createBrowserClient } from "@/lib/supabase/browser";
import {
  estimarSegundosDeEnvio,
  formatarDuracao,
  subirComProgresso,
} from "@/lib/video/upload";

/**
 * Edição do vídeo que o vereador grava no celular e sobe pelo painel.
 *
 * Pelo WhatsApp isso não fecha: a Meta só entrega vídeo de até 16MB, e um
 * minuto em 1080p já passa disso. Pelo painel o arquivo sobe inteiro para o
 * Storage e volta como link, sem teto de tamanho atrapalhando.
 *
 * O caminho é o mesmo que o teleprompter já usa: Storage → URL assinada →
 * ZapCap → polling. Aqui a origem é um arquivo escolhido, não uma gravação
 * feita na hora.
 */

/** Acima disto o upload trava em rede de celular; avisa antes de tentar. */
const LIMITE_MB = 200;

/** O render do ZapCap leva ~1 min; 45 tentativas de 4s dão 3 min de folga. */
const MAX_TENTATIVAS = 45;

type Estado = "idle" | "enviando" | "cortando" | "processando" | "pronto" | "falhou";

/** Quanto o corte economizou, para mostrar ao assessor o que foi feito. */
type Corte = { original: number; final: number; cortes: number };

export function VideoEditor({ legendasDisponiveis }: { legendasDisponiveis: boolean }) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [cortarPausas, setCortarPausas] = useState(true);
  const [legendar, setLegendar] = useState(legendasDisponiveis);
  const [estado, setEstado] = useState<Estado>("idle");
  const [corte, setCorte] = useState<Corte | null>(null);
  const [saida, setSaida] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [porcento, setPorcento] = useState(0);
  const [decorrido, setDecorrido] = useState(0);
  const pollRef = useRef<number | null>(null);
  const relogioRef = useRef<number | null>(null);

  const pararPolling = useCallback(() => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pararRelogio = useCallback(() => {
    if (relogioRef.current) {
      window.clearInterval(relogioRef.current);
      relogioRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      pararPolling();
      pararRelogio();
    },
    [pararPolling, pararRelogio]
  );

  const acompanhar = useCallback(
    (requestId: string) => {
      let tentativas = 0;
      pararPolling();
      pollRef.current = window.setInterval(async () => {
        tentativas += 1;
        try {
          const res = await fetch(`/api/zapcap?requestId=${requestId}`);
          const j = await res.json();
          if (j.status === "ready" && j.output_url) {
            pararPolling();
            pararRelogio();
            setSaida(j.output_url);
            setEstado("pronto");
          } else if (j.status === "failed") {
            pararPolling();
            pararRelogio();
            setErro(j.error || "Não foi possível gerar as legendas.");
            setEstado("falhou");
          } else if (tentativas > MAX_TENTATIVAS) {
            pararPolling();
            pararRelogio();
            setErro("A edição está demorando mais que o normal. Tente de novo em instantes.");
            setEstado("falhou");
          }
        } catch {
          /* rede instável no plenário: segue tentando até o limite */
        }
      }, 4000);
    },
    [pararPolling, pararRelogio]
  );

  const enviar = useCallback(async () => {
    if (!arquivo) return;
    setErro(null);
    setSaida(null);
    setCorte(null);
    setPorcento(0);
    setDecorrido(0);
    setEstado("enviando");

    // Relógio próprio: numa espera de minutos o vereador precisa ver que
    // alguma coisa está andando, mesmo quando a porcentagem trava.
    const inicio = Date.now();
    pararRelogio();
    relogioRef.current = window.setInterval(
      () => setDecorrido(Math.round((Date.now() - inicio) / 1000)),
      1000
    );

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

      const assinada = await supabase.storage.from("recordings").createSignedUrl(caminho, 3600);
      if (!assinada.data?.signedUrl) {
        throw new Error("Não foi possível preparar o vídeo para edição.");
      }
      let videoUrl: string = assinada.data.signedUrl;

      // O corte vem antes da legenda: legendar primeiro deixaria a legenda
      // fora de sincronia com a fala depois que as pausas saíssem.
      if (cortarPausas) {
        setEstado("cortando");
        const rc = await fetch("/api/video/cortar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: caminho }),
        });
        const jc = await rc.json();
        if (!rc.ok) throw new Error(jc.error || "Falha ao cortar as pausas.");
        videoUrl = jc.url;
        setCorte({ original: jc.duracao_original, final: jc.duracao_final, cortes: jc.cortes });
      }

      // Sem legenda o trabalho acabou aqui: o corte já devolveu o vídeo
      // pronto, e o ZapCap é o único passo que depende de chave externa.
      if (!legendar) {
        pararRelogio();
        setSaida(videoUrl);
        setEstado("pronto");
        return;
      }

      const res = await fetch("/api/zapcap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl }),
      });
      const j = await res.json();
      if (!res.ok || j.status === "failed") throw new Error(j.error || "Falha ao solicitar a edição.");

      setEstado("processando");
      acompanhar(j.request_id);
    } catch (e) {
      pararRelogio();
      setErro(e instanceof Error ? e.message : "Falha na edição do vídeo.");
      setEstado("falhou");
    }
  }, [arquivo, cortarPausas, legendar, acompanhar, pararRelogio]);

  const escolher = useCallback((f: File | null) => {
    setSaida(null);
    setEstado("idle");
    if (f && f.size > LIMITE_MB * 1024 * 1024) {
      setArquivo(null);
      setErro(`O vídeo tem ${(f.size / 1024 / 1024).toFixed(0)}MB. O limite é ${LIMITE_MB}MB.`);
      return;
    }
    setErro(null);
    setArquivo(f);
  }, []);

  const ocupado = estado === "enviando" || estado === "cortando" || estado === "processando";
  const nadaMarcado = !cortarPausas && !legendar;

  return (
    <div className="space-y-4">
      <label
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition ${
          ocupado ? "pointer-events-none opacity-50" : "border-sand-200 hover:border-brand-700/40"
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
            : `MP4 ou MOV, até ${LIMITE_MB}MB`}
        </span>
        <input
          type="file"
          accept="video/*"
          className="hidden"
          disabled={ocupado}
          onChange={(e) => escolher(e.target.files?.[0] ?? null)}
        />
      </label>

      {arquivo && estado !== "pronto" && (
        <>
          <label className="flex items-start gap-3 rounded-2xl bg-white p-4 ring-1 ring-sand-200">
            <input
              type="checkbox"
              checked={cortarPausas}
              disabled={ocupado}
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
              disabled={ocupado || !legendasDisponiveis}
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
            disabled={ocupado || nadaMarcado}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-700 px-5 py-3 text-sm font-medium text-sand-50 transition hover:bg-brand-800 disabled:opacity-60"
          >
            {ocupado && <Loader2 size={16} className="animate-spin" />}
            {estado === "enviando"
              ? "Enviando o vídeo…"
              : estado === "cortando"
                ? "Cortando as pausas…"
                : estado === "processando"
                  ? "Gerando as legendas…"
                  : nadaMarcado
                    ? "Escolha o que fazer com o vídeo"
                    : "Editar vídeo"}
          </button>
        </>
      )}

      {ocupado && (
        <div className="space-y-2 rounded-2xl bg-white p-4 ring-1 ring-sand-200">
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="font-medium text-ink-900">
              {estado === "enviando"
                ? `Enviando ${porcento}%`
                : estado === "cortando"
                  ? "Cortando as pausas"
                  : "Gerando as legendas"}
            </span>
            <span className="tabular-nums text-ink-400">{formatarDuracao(decorrido)}</span>
          </div>

          <div className="h-1.5 overflow-hidden rounded-full bg-sand-200">
            <div
              className={`h-full rounded-full bg-brand-700 transition-[width] duration-300 ${
                estado === "enviando" ? "" : "animate-pulse"
              }`}
              // Depois do envio não há percentual real vindo do servidor: a
              // barra fica cheia e pulsando em vez de mentir um número.
              style={{ width: estado === "enviando" ? `${Math.max(2, porcento)}%` : "100%" }}
            />
          </div>

          <p className="text-xs text-ink-500">
            {estado === "enviando"
              ? "Mantenha o app aberto. Em rede de celular o envio é a parte mais demorada."
              : "O vídeo já está no servidor. Agora é o processamento."}
          </p>
        </div>
      )}

      {erro && (
        <p className="flex items-start gap-2 rounded-2xl bg-white p-4 text-sm text-ink-900 ring-1 ring-sand-200">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-600" strokeWidth={1.8} />
          {erro}
        </p>
      )}

      {estado === "pronto" && saida && (
        <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-brand-700/20">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-700">
            <CheckCircle2 size={15} strokeWidth={2.2} />
            Vídeo pronto
          </p>
          {corte && (
            <p className="text-sm text-ink-500">
              {corte.cortes} {corte.cortes === 1 ? "pausa removida" : "pausas removidas"} — de{" "}
              {corte.original}s para <strong className="text-ink-900">{corte.final}s</strong>.
            </p>
          )}
          <video src={saida} controls playsInline className="w-full rounded-xl bg-black" />
          <a
            href={saida}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-700 px-5 py-3 text-sm font-medium text-sand-50 transition hover:bg-brand-800"
          >
            <Download size={16} strokeWidth={1.9} />
            Baixar vídeo
          </a>
        </div>
      )}
    </div>
  );
}
