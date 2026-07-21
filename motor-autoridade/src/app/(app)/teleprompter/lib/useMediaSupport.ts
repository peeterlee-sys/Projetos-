"use client";

import { useSyncExternalStore } from "react";
import { detectMediaSupport, type MediaSupport } from "./mediaSupport";

/**
 * Lê as capacidades de mídia do navegador sem `setState` em effect e sem
 * divergência de hidratação.
 *
 * `useSyncExternalStore` usa o snapshot de servidor (tudo desabilitado) para
 * o HTML inicial e o snapshot do cliente (detecção real) após a hidratação. O
 * resultado é memoizado em módulo para que `getSnapshot` devolva sempre a
 * mesma referência — condição para o store não entrar em loop.
 */

const SERVER_SNAPSHOT: MediaSupport = {
  secureContext: false,
  getUserMedia: false,
  mediaRecorder: false,
  supportedMimeType: null,
  canShareFiles: false,
};

let clientSnapshot: MediaSupport | null = null;

function subscribe(): () => void {
  // As capacidades não mudam durante a sessão; nada a assinar.
  return () => {};
}

function getSnapshot(): MediaSupport {
  if (clientSnapshot === null) clientSnapshot = detectMediaSupport();
  return clientSnapshot;
}

function getServerSnapshot(): MediaSupport {
  return SERVER_SNAPSHOT;
}

export function useMediaSupport(): MediaSupport {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
