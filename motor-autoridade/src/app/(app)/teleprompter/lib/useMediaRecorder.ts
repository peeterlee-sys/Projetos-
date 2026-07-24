"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { extensionForMimeType } from "./mediaSupport";

export type RecorderStatus = "idle" | "recording" | "paused";

/** Evento de gravação, exibido no painel de diagnóstico e útil para depurar
 *  diferenças entre navegadores. */
export type RecordingEvent = {
  id: number;
  at: number;
  type:
    | "start"
    | "pause"
    | "resume"
    | "stop"
    | "dataavailable"
    | "error";
  detail?: string;
};

export type Recording = {
  url: string;
  blob: Blob;
  mimeType: string;
  extension: string;
  size: number;
  durationMs: number;
};

export type UseMediaRecorder = {
  status: RecorderStatus;
  events: RecordingEvent[];
  recording: Recording | null;
  error: string | null;
  isRecording: boolean;
  isPaused: boolean;
  start: (stream: MediaStream, mimeType: string | null) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  reset: () => void;
};

/**
 * Encapsula a API `MediaRecorder`, transformando seus callbacks imperativos
 * em estado React e num log de eventos.
 *
 * Decisões de compatibilidade (risco R2):
 * - `start(1000)` usa timeslice de 1s para que `dataavailable` dispare
 *   periodicamente. Sem isso, alguns navegadores só entregam os dados no
 *   `stop`, o que atrasa feedback e aumenta o pico de memória.
 * - A criação do recorder tenta primeiro com o `mimeType` escolhido; se o
 *   navegador recusar (ex.: Safari antigo), refaz sem opções, deixando o
 *   navegador decidir o formato.
 * - O `mimeType` real do blob é lido de `recorder.mimeType` (ou do primeiro
 *   chunk), nunca assumido — é o que garante a extensão de download correta.
 */
export function useMediaRecorder(): UseMediaRecorder {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [events, setEvents] = useState<RecordingEvent[]>([]);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const eventIdRef = useRef(0);
  const startedAtRef = useRef(0);
  const elapsedRef = useRef(0);
  const mimeTypeRef = useRef("");
  // Guarda a última object URL para revogá-la e evitar vazamento de memória.
  const lastUrlRef = useRef<string | null>(null);
  // Garante que a finalização (montar o blob/preview) rode UMA vez só, venha
  // ela do onstop nativo ou do watchdog de segurança.
  const finalizedRef = useRef(false);

  const log = useCallback((type: RecordingEvent["type"], detail?: string) => {
    eventIdRef.current += 1;
    setEvents((prev) => [
      ...prev,
      { id: eventIdRef.current, at: Date.now(), type, detail },
    ]);
  }, []);

  const revokeLastUrl = useCallback(() => {
    if (lastUrlRef.current) {
      URL.revokeObjectURL(lastUrlRef.current);
      lastUrlRef.current = null;
    }
  }, []);

  /**
   * Monta o blob/preview a partir dos chunks. Chamada pelo `onstop` nativo e
   * também pelo watchdog em `stop()` — o `finalizedRef` impede execução dupla.
   * Se nada foi capturado, mostra erro claro em vez de deixar a tela travada.
   */
  const finalize = useCallback(() => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;

    const durationMs =
      elapsedRef.current +
      (startedAtRef.current ? Date.now() - startedAtRef.current : 0);
    const type = mimeTypeRef.current || chunksRef.current[0]?.type || "video/webm";
    const blob = new Blob(chunksRef.current, { type });

    recorderRef.current = null;
    setStatus("idle");

    if (blob.size === 0) {
      const msg =
        "Não capturamos o vídeo desta vez. Confira as permissões de câmera/microfone e toque em Gravar novamente.";
      setError(msg);
      log("error", msg);
      return;
    }

    const url = URL.createObjectURL(blob);
    lastUrlRef.current = url;
    setRecording({
      url,
      blob,
      mimeType: type,
      extension: extensionForMimeType(type),
      size: blob.size,
      durationMs,
    });
    log("stop", `${blob.size} bytes, ${(durationMs / 1000).toFixed(1)}s`);
  }, [log]);

  const start = useCallback(
    (stream: MediaStream, mimeType: string | null) => {
      setError(null);
      setRecording(null);
      revokeLastUrl();
      setEvents([]);
      eventIdRef.current = 0;
      chunksRef.current = [];
      elapsedRef.current = 0;
      startedAtRef.current = 0;
      finalizedRef.current = false;

      // Bitrates generosos: áudio 192 kbps (voz nítida) e vídeo 5 Mbps.
      const quality = {
        audioBitsPerSecond: 192_000,
        videoBitsPerSecond: 5_000_000,
      };

      let recorder: MediaRecorder;
      try {
        recorder = mimeType
          ? new MediaRecorder(stream, { mimeType, ...quality })
          : new MediaRecorder(stream, quality);
      } catch {
        // Fallback: alguns navegadores recusam o mimeType — tenta sem opções.
        try {
          recorder = new MediaRecorder(stream);
        } catch (err) {
          const msg =
            err instanceof Error
              ? err.message
              : "MediaRecorder indisponível neste navegador.";
          setError(msg);
          log("error", msg);
          return;
        }
      }

      mimeTypeRef.current = recorder.mimeType || mimeType || "";

      recorder.ondataavailable = (ev: BlobEvent) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
          log("dataavailable", `${ev.data.size} bytes`);
        }
      };
      recorder.onstart = () => {
        startedAtRef.current = Date.now();
        setStatus("recording");
        log("start");
      };
      recorder.onpause = () => {
        elapsedRef.current += Date.now() - startedAtRef.current;
        setStatus("paused");
        log("pause");
      };
      recorder.onresume = () => {
        startedAtRef.current = Date.now();
        setStatus("recording");
        log("resume");
      };
      recorder.onerror = (ev: Event) => {
        const err = (ev as unknown as { error?: DOMException }).error;
        const msg = err?.message || "Erro durante a gravação.";
        setError(msg);
        log("error", msg);
      };
      recorder.onstop = () => finalize();

      recorderRef.current = recorder;
      try {
        recorder.start(1000);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Não foi possível iniciar a gravação.";
        setError(msg);
        log("error", msg);
        recorderRef.current = null;
      }
    },
    [log, revokeLastUrl, finalize],
  );

  const pause = useCallback(() => {
    const r = recorderRef.current;
    if (r && r.state === "recording") r.pause();
  }, []);

  const resume = useCallback(() => {
    const r = recorderRef.current;
    if (r && r.state === "paused") r.resume();
  }, []);

  const stop = useCallback(() => {
    const r = recorderRef.current;
    try {
      if (r && r.state !== "inactive") {
        // Flush do último trecho antes de encerrar (alguns navegadores só
        // entregam os dados aqui) e então para.
        try {
          r.requestData();
        } catch {
          /* nem todo navegador implementa requestData */
        }
        r.stop();
      } else {
        finalize();
      }
    } catch {
      finalize();
    }
    // Watchdog: se o onstop não disparar (bug conhecido no iOS/Safari), a
    // finalização acontece mesmo assim — a tela nunca fica travada.
    window.setTimeout(() => finalize(), 1500);
  }, [finalize]);

  const reset = useCallback(() => {
    // Bloqueia qualquer finalização atrasada (watchdog) de sobrescrever o reset.
    finalizedRef.current = true;
    revokeLastUrl();
    setRecording(null);
    setEvents([]);
    setError(null);
    eventIdRef.current = 0;
    setStatus("idle");
  }, [revokeLastUrl]);

  // Limpeza ao desmontar: encerra gravação em andamento e revoga a URL.
  useEffect(() => {
    return () => {
      const r = recorderRef.current;
      if (r && r.state !== "inactive") {
        try {
          r.stop();
        } catch {
          /* ignora */
        }
      }
      revokeLastUrl();
    };
  }, [revokeLastUrl]);

  return {
    status,
    events,
    recording,
    error,
    isRecording: status === "recording",
    isPaused: status === "paused",
    start,
    pause,
    resume,
    stop,
    reset,
  };
}
