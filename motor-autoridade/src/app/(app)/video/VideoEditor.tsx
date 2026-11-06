"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Loader2, CheckCircle2, AlertCircle, Download } from "lucide-react";
import { createClient as createBrowserClient } from "@/lib/supabase/browser";

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

type Estado = "idle" | "enviando" | "processando" | "pronto" | "falhou";

export function VideoEditor({ configurado }: { configurado: boolean }) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [estado, setEstado] = useState<Estado>("idle");
  const [saida, setSaida] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const pararPolling = useCallback(() => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => pararPolling(), [pararPolling]);

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
            setSaida(j.output_url);
            setEstado("pronto");
          } else if (j.status === "failed") {
            pararPolling();
            setErro(j.error || "Não foi possível gerar as legendas.");
            setEstado("falhou");
          } else if (tentativas > MAX_TENTATIVAS) {
            pararPolling();
            setErro("A edição está demorando mais que o normal. Tente de novo em instantes.");
            setEstado("falhou");
          }
        } catch {
          /* rede instável no plenário: segue tentando até o limite */
        }
      }, 4000);
    },
    [pararPolling]
  );

  const enviar = useCallback(async () => {
    if (!arquivo) return;
    setErro(null);
    setSaida(null);
    setEstado("enviando");
    try {
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada. Faça login novamente.");

      const ext = arquivo.name.split(".").pop()?.toLowerCase() || "mp4";
      const caminho = `${user.id}/${Date.now()}.${ext}`;
      const up = await supabase.storage
        .from("recordings")
        .upload(caminho, arquivo, { contentType: arquivo.type || "video/mp4", upsert: true });
      if (up.error) throw new Error(`Falha ao enviar o vídeo: ${up.error.message}`);

      const assinada = await supabase.storage.from("recordings").createSignedUrl(caminho, 3600);
      const videoUrl = assinada.data?.signedUrl;
      if (!videoUrl) throw new Error("Não foi possível preparar o vídeo para edição.");

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
      setErro(e instanceof Error ? e.message : "Falha na edição do vídeo.");
      setEstado("falhou");
    }
  }, [arquivo, acompanhar]);

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

  if (!configurado) {
    return (
      <p className="rounded-2xl bg-white p-6 text-sm text-ink-500 ring-1 ring-sand-200">
        A edição de vídeo ainda não está configurada nesta conta.
      </p>
    );
  }

  const ocupado = estado === "enviando" || estado === "processando";

  return (
    <div className="space-y-4">
      <label
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition ${
          ocupado ? "pointer-events-none opacity-50" : "border-sand-200 hover:border-brand-700/40"
        }`}
      >
        <Upload size={26} className="text-brand-700" strokeWidth={1.8} />
        <span className="text-sm font-medium text-ink-900">
          {arquivo ? arquivo.name : "Escolher o vídeo do vereador"}
        </span>
        <span className="text-xs text-ink-500">
          {arquivo
            ? `${(arquivo.size / 1024 / 1024).toFixed(1)}MB`
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
        <button
          type="button"
          onClick={enviar}
          disabled={ocupado}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-700 px-5 py-3 text-sm font-medium text-sand-50 transition hover:bg-brand-800 disabled:opacity-60"
        >
          {ocupado && <Loader2 size={16} className="animate-spin" />}
          {estado === "enviando"
            ? "Enviando o vídeo…"
            : estado === "processando"
              ? "Gerando as legendas…"
              : "Gerar legendas"}
        </button>
      )}

      {estado === "processando" && (
        <p className="text-center text-xs text-ink-500">
          Leva cerca de um minuto. Pode deixar esta aba aberta.
        </p>
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
            Vídeo com legendas pronto
          </p>
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
