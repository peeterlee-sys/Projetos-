"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@/components/ui";
import { type MediaSupport } from "./lib/mediaSupport";
import { useMediaSupport } from "./lib/useMediaSupport";
import { useMediaRecorder } from "./lib/useMediaRecorder";
import { useAutoScroll } from "./lib/useAutoScroll";

export const DEFAULT_SCRIPT = `Cole aqui o roteiro que você quer gravar, ou gere um vídeo na Biblioteca e abra direto no teleprompter.

Ajuste a velocidade e o tamanho da fonte, posicione-se em frente à câmera e toque em Gravar. O texto rola sozinho enquanto você fala.

Ao final, salve o vídeo no seu dispositivo para publicar.`;

type TeleprompterProps = {
  initialScript?: string;
  title?: string;
  recordingTips?: string | null;
  durationSec?: number | null;
  backHref?: string;
  backLabel?: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function timestampName(ext: string): string {
  const d = new Date();
  const p = (n: number) => n.toString().padStart(2, "0");
  return `teleprompter-${d.getFullYear()}${p(d.getMonth() + 1)}${p(
    d.getDate(),
  )}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`;
}

export default function Teleprompter({
  initialScript,
  title,
  recordingTips,
  durationSec,
  backHref = "/hoje",
  backLabel = "Voltar",
}: TeleprompterProps) {
  const support = useMediaSupport();
  const [script, setScript] = useState(initialScript?.trim() || DEFAULT_SCRIPT);
  const [editing, setEditing] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  // Espelho desligado por padrão: a maioria grava no celular e o vídeo final
  // não é espelhado — o preview deve mostrar o resultado real.
  const [mirror, setMirror] = useState(false);
  const [darkEffect, setDarkEffect] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fontSize, setFontSize] = useState(38);
  const [speed, setSpeed] = useState(60); // px/s
  const [showEvents, setShowEvents] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const recorder = useMediaRecorder();
  const {
    containerRef: scriptRef,
    scrolling,
    toggle: toggleScroll,
    play: playScroll,
    pause: pauseScroll,
    reset: resetScroll,
  } = useAutoScroll(speed);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }, []);

  const startCamera = useCallback(async (mode: "user" | "environment") => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "Este navegador não permite acesso à câmera. Use o modo somente-teleprompter.",
      );
      return;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode },
        // Sem processamento de "chamada de voz" (eco/ruído): som mais cheio e
        // natural para gravação de conteúdo. O preview é mudo, sem risco de eco.
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch {
          /* autoplay pode ser bloqueado; o preview aparece mesmo assim */
        }
      }
      setCameraOn(true);
    } catch (err) {
      const msg =
        err instanceof DOMException
          ? err.name === "NotAllowedError"
            ? "Permissão de câmera/microfone negada."
            : err.name === "NotFoundError"
              ? "Nenhuma câmera encontrada neste dispositivo."
              : err.message
          : "Não foi possível acessar a câmera.";
      setCameraError(msg);
      setCameraOn(false);
    }
  }, []);

  const flipCamera = useCallback(() => {
    const next = facingMode === "user" ? "environment" : "user";
    setFacingMode(next);
    if (next === "environment") setMirror(false);
    if (cameraOn) void startCamera(next);
  }, [facingMode, cameraOn, startCamera]);

  const handleRecord = useCallback(() => {
    if (!streamRef.current) return;
    recorder.start(streamRef.current, support.supportedMimeType);
    resetScroll();
    playScroll();
  }, [recorder, resetScroll, playScroll, support]);

  const handleStop = useCallback(() => {
    recorder.stop();
    pauseScroll();
  }, [recorder, pauseScroll]);

  const handleTogglePause = useCallback(() => {
    if (recorder.isRecording) {
      recorder.pause();
      pauseScroll();
    } else if (recorder.isPaused) {
      recorder.resume();
      playScroll();
    }
  }, [recorder, pauseScroll, playScroll]);

  const handleShare = useCallback(async () => {
    setShareError(null);
    const rec = recorder.recording;
    if (!rec || !navigator.canShare || !navigator.share) return;
    const file = new File([rec.blob], timestampName(rec.extension), {
      type: rec.mimeType,
    });
    if (!navigator.canShare({ files: [file] })) {
      setShareError("Este navegador não permite compartilhar o arquivo.");
      return;
    }
    try {
      await navigator.share({ files: [file], title: title ?? "Gravação do teleprompter" });
      setSaved(true);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setShareError("Não foi possível compartilhar o vídeo.");
    }
  }, [recorder.recording, title]);

  const handleReRecord = useCallback(() => {
    setSaved(false);
    setShareError(null);
    recorder.reset();
  }, [recorder]);

  const canRecord = support.mediaRecorder && cameraOn;
  const busy = recorder.isRecording || recorder.isPaused;

  const downloadName = useMemo(
    () =>
      recorder.recording
        ? timestampName(recorder.recording.extension)
        : "teleprompter.webm",
    [recorder.recording],
  );

  return (
    <main className="px-5 pt-8">
      <Link href={backHref} className="text-sm text-ink-500">
        ← {backLabel}
      </Link>
      <header className="mb-4 mt-2">
        <p className="text-xs uppercase tracking-wide text-gold-700">Teleprompter</p>
        <h1 className="mt-1 font-serif text-2xl text-ink-900">
          {title ?? "Grave seu vídeo"}
        </h1>
        {durationSec ? (
          <p className="mt-1 text-xs text-ink-400">
            Duração sugerida: {formatDuration(durationSec * 1000)}
          </p>
        ) : null}
      </header>

      <SupportBanners support={support} cameraError={cameraError} />

      {/* Palco: preview + roteiro sobreposto */}
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-[var(--radius-card)] bg-black">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ transform: mirror ? "scaleX(-1)" : undefined }}
          playsInline
          muted
          autoPlay
        />
        {!cameraOn && (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-sand-200">
            {support.getUserMedia
              ? "Câmera desligada. Ative para ver o preview e gravar."
              : "Modo somente-teleprompter: câmera indisponível neste navegador."}
          </div>
        )}

        <div
          ref={scriptRef}
          className="pointer-events-none absolute inset-0 overflow-y-auto px-5 pt-[18%] pb-[70%]"
          style={{
            background: darkEffect
              ? "linear-gradient(to bottom, rgba(0,0,0,0.92), rgba(0,0,0,0.62) 25%, rgba(0,0,0,0.62) 75%, rgba(0,0,0,0.92))"
              : "linear-gradient(to bottom, rgba(0,0,0,0.6), rgba(0,0,0,0.15) 22%, rgba(0,0,0,0.15) 78%, rgba(0,0,0,0.6))",
          }}
        >
          <p
            className="whitespace-pre-wrap text-center font-serif font-semibold leading-snug text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]"
            style={{ fontSize, transform: mirror ? "scaleX(-1)" : undefined }}
          >
            {script}
          </p>
        </div>

        {busy && (
          <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                recorder.isPaused ? "bg-gold-500" : "animate-pulse bg-danger-600"
              }`}
            />
            {recorder.isPaused ? "Pausado" : "Gravando"}
          </div>
        )}
      </div>

      {/* Controles principais */}
      <div className="mt-4 flex flex-wrap gap-2">
        {!cameraOn ? (
          <Button
            onClick={() => void startCamera(facingMode)}
            disabled={!support.getUserMedia}
          >
            Ativar câmera
          </Button>
        ) : (
          <Button variant="secondary" onClick={stopStream} disabled={busy}>
            Desligar câmera
          </Button>
        )}

        {!busy ? (
          <Button
            onClick={handleRecord}
            disabled={!canRecord}
            className="bg-danger-600 text-white hover:bg-danger-700"
          >
            ● Gravar
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={handleTogglePause}>
              {recorder.isPaused ? "Retomar" : "Pausar"}
            </Button>
            <Button onClick={handleStop}>■ Parar</Button>
          </>
        )}

        {cameraOn && (
          <Button
            variant="ghost"
            onClick={flipCamera}
            disabled={busy}
            title="Alternar câmera frontal/traseira"
          >
            Virar câmera
          </Button>
        )}
      </div>

      {/* Controles de rolagem */}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="ghost" onClick={toggleScroll}>
          {scrolling ? "Pausar rolagem" : "Rolar texto"}
        </Button>
        <Button variant="ghost" onClick={resetScroll}>
          Reiniciar
        </Button>
      </div>

      {recorder.error && (
        <p className="mt-3 text-sm text-danger-600">{recorder.error}</p>
      )}

      {/* Ajustes */}
      <div className="mt-5 space-y-4">
        <SliderField
          label="Velocidade"
          value={speed}
          min={10}
          max={200}
          step={5}
          suffix=" px/s"
          onChange={setSpeed}
        />
        <SliderField
          label="Tamanho da fonte"
          value={fontSize}
          min={20}
          max={72}
          step={2}
          suffix=" px"
          onChange={setFontSize}
        />
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={darkEffect}
            onChange={(e) => setDarkEffect(e.target.checked)}
            className="h-4 w-4 accent-brand-700"
          />
          Efeito dark (escurece o fundo e destaca o texto)
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={mirror}
            onChange={(e) => setMirror(e.target.checked)}
            className="h-4 w-4 accent-brand-700"
          />
          Espelhar preview
        </label>
      </div>

      {recordingTips ? (
        <Card className="mt-5">
          <p className="text-xs uppercase tracking-wide text-ink-400">
            Orientação de gravação
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">
            {recordingTips}
          </p>
        </Card>
      ) : null}

      {/* Roteiro */}
      <div className="mt-5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-sm font-medium text-ink-700">Roteiro</span>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="text-xs text-ink-500 underline-offset-4 hover:underline"
          >
            {editing ? "Concluir" : "Editar"}
          </button>
        </div>
        {editing ? (
          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            rows={8}
            className="w-full resize-y rounded-2xl border border-sand-300 bg-sand-50 px-4 py-3 text-ink-900 outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-700/20"
            placeholder="Cole ou digite o roteiro..."
          />
        ) : (
          <p className="line-clamp-3 rounded-2xl bg-sand-100 px-4 py-3 text-xs text-ink-500">
            {script.trim() || "Nenhum roteiro."}
          </p>
        )}
      </div>

      {recorder.recording && (
        <RecordingResult
          url={recorder.recording.url}
          size={recorder.recording.size}
          durationMs={recorder.recording.durationMs}
          downloadName={downloadName}
          canShare={support.canShareFiles}
          onShare={handleShare}
          onReRecord={handleReRecord}
          shareError={shareError}
          saved={saved}
          onDownloaded={() => setSaved(true)}
          backHref={backHref}
          backLabel={backLabel}
        />
      )}

      {/* Eventos de gravação */}
      <div className="mt-5 rounded-[var(--radius-card)] ring-1 ring-sand-200">
        <button
          type="button"
          onClick={() => setShowEvents((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-ink-700"
        >
          <span>Eventos de gravação ({recorder.events.length})</span>
          <span className="text-ink-400">{showEvents ? "▲" : "▼"}</span>
        </button>
        {showEvents && (
          <div className="max-h-56 overflow-y-auto border-t border-sand-200 px-4 py-3">
            {recorder.events.length === 0 ? (
              <p className="text-xs text-ink-400">
                Nenhum evento ainda. Inicie uma gravação.
              </p>
            ) : (
              <ul className="flex flex-col gap-1 font-mono text-xs text-ink-700">
                {recorder.events.map((ev) => (
                  <li key={ev.id} className="flex gap-3">
                    <span className="text-ink-400">
                      {new Date(ev.at).toLocaleTimeString()}
                    </span>
                    <span className="font-semibold">{ev.type}</span>
                    {ev.detail && <span className="text-ink-500">{ev.detail}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-sm">
        <label className="font-medium text-ink-700">{label}</label>
        <span className="text-ink-400">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brand-700"
      />
    </div>
  );
}

function RecordingResult({
  url,
  size,
  durationMs,
  downloadName,
  canShare,
  onShare,
  onReRecord,
  shareError,
  saved,
  onDownloaded,
  backHref,
  backLabel,
}: {
  url: string;
  size: number;
  durationMs: number;
  downloadName: string;
  canShare: boolean;
  onShare: () => void;
  onReRecord: () => void;
  shareError: string | null;
  saved: boolean;
  onDownloaded: () => void;
  backHref: string;
  backLabel: string;
}) {
  return (
    <Card className="mt-5 space-y-3">
      <div className="flex items-center justify-between text-sm font-medium text-ink-900">
        <span>Gravação pronta</span>
        <span className="text-xs font-normal text-ink-400">
          {formatDuration(durationMs)} · {formatBytes(size)}
        </span>
      </div>
      <video src={url} controls playsInline className="w-full rounded-2xl bg-black" />
      <div className="flex flex-wrap gap-2">
        {canShare ? (
          // Celular: a folha nativa do sistema permite "Salvar vídeo" no rolo
          // da câmera (ou enviar direto para Instagram/WhatsApp etc.).
          <Button onClick={onShare}>Salvar no rolo da câmera</Button>
        ) : (
          <a
            href={url}
            download={downloadName}
            onClick={onDownloaded}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-700 px-5 py-3 text-sm font-medium text-sand-50 transition hover:bg-brand-800 active:scale-[0.98]"
          >
            Salvar vídeo
          </a>
        )}
        {canShare && (
          <a
            href={url}
            download={downloadName}
            onClick={onDownloaded}
            className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium text-ink-500 transition hover:text-ink-700"
          >
            Baixar arquivo
          </a>
        )}
        <Button variant="ghost" onClick={onReRecord}>
          Regravar
        </Button>
      </div>
      {shareError && <p className="text-xs text-danger-600">{shareError}</p>}

      {saved && (
        <div className="rounded-2xl bg-brand-700/5 p-4 ring-1 ring-brand-700/15">
          <p className="text-sm font-medium text-brand-700">✅ Vídeo salvo!</p>
          <p className="mt-1 text-sm text-ink-700">
            Agora é só publicar nas suas redes. Quando publicar, marque o
            conteúdo como publicado — é assim que seu progresso da semana conta.
          </p>
          <Link
            href={backHref}
            className="mt-3 inline-flex items-center justify-center gap-2 rounded-full bg-brand-700 px-5 py-3 text-sm font-medium text-sand-50 transition hover:bg-brand-800 active:scale-[0.98]"
          >
            Concluir → {backLabel}
          </Link>
        </div>
      )}
    </Card>
  );
}

function SupportBanners({
  support,
  cameraError,
}: {
  support: MediaSupport;
  cameraError: string | null;
}) {
  const warnings: string[] = [];
  if (!support.secureContext) {
    warnings.push(
      "A câmera só funciona em conexão segura (HTTPS ou localhost). Abra o app por HTTPS.",
    );
  }
  if (!support.getUserMedia) {
    warnings.push(
      "Este navegador não expõe acesso à câmera. Você ainda pode usar a rolagem do roteiro (modo somente-teleprompter).",
    );
  } else if (!support.mediaRecorder) {
    warnings.push(
      "Este navegador não suporta gravação de vídeo (MediaRecorder). Use a rolagem do roteiro e grave com o app de câmera do sistema.",
    );
  }

  if (warnings.length === 0 && !cameraError) return null;

  return (
    <div className="mb-4 flex flex-col gap-2">
      {warnings.map((w) => (
        <p
          key={w}
          className="rounded-2xl bg-gold-300/30 px-4 py-2 text-sm text-gold-700 ring-1 ring-gold-300"
        >
          {w}
        </p>
      ))}
      {cameraError && (
        <p className="rounded-2xl bg-danger-600/10 px-4 py-2 text-sm text-danger-700 ring-1 ring-danger-600/30">
          {cameraError}
        </p>
      )}
    </div>
  );
}
