/**
 * Detecção de suporte de mídia do navegador.
 *
 * O teleprompter grava vídeo localmente com `getUserMedia` + `MediaRecorder`.
 * Esses recursos variam bastante entre navegadores (risco R2 do diagnóstico):
 *
 * - `getUserMedia` só existe em contexto seguro (https ou localhost).
 * - `MediaRecorder` chegou tarde ao Safari/iOS (iOS 14.3+) e ainda hoje só
 *   grava em `video/mp4`, enquanto Chrome/Firefox preferem `video/webm`.
 *
 * Por isso a UI nunca assume um formato: ela pergunta ao navegador qual
 * `mimeType` é suportado e cai para o padrão do próprio navegador quando
 * nenhum candidato passa em `isTypeSupported`.
 */

export type MediaSupport = {
  /** Contexto seguro (https/localhost). `getUserMedia` exige isso. */
  secureContext: boolean;
  /** `navigator.mediaDevices.getUserMedia` está disponível. */
  getUserMedia: boolean;
  /** A API `MediaRecorder` existe (gravação possível). */
  mediaRecorder: boolean;
  /** Melhor `mimeType` suportado, ou `null` para usar o padrão do navegador. */
  supportedMimeType: string | null;
  /** Web Share API com arquivos (útil para "salvar" no iOS). */
  canShareFiles: boolean;
};

/**
 * Candidatos em ordem de preferência. MP4/H.264 PRIMEIRO: é o único formato
 * que as galerias de foto (rolo da câmera iOS/Android) aceitam salvar. WebM
 * fica como fallback para navegadores sem gravação MP4 (ex.: Firefox).
 */
const CANDIDATE_MIME_TYPES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=h264,aac",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

/**
 * Escolhe o melhor `mimeType` suportado para gravação.
 * Retorna `null` quando o navegador não expõe `isTypeSupported` — nesse caso
 * o `MediaRecorder` deve ser criado sem opções, usando o padrão do navegador.
 */
export function pickMimeType(): string | null {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof MediaRecorder.isTypeSupported !== "function"
  ) {
    return null;
  }
  for (const type of CANDIDATE_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}

/**
 * Extensão de arquivo coerente com o `mimeType` gravado, para o download
 * salvar com o nome certo (.mp4 no iOS, .webm no Chrome/Firefox).
 */
export function extensionForMimeType(mimeType: string | null | undefined): string {
  if (mimeType && mimeType.includes("mp4")) return "mp4";
  return "webm";
}

/**
 * Faz o levantamento completo de capacidades. Deve rodar no cliente
 * (depende de `window`/`navigator`); em SSR retorna tudo desabilitado.
 */
export function detectMediaSupport(): MediaSupport {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      secureContext: false,
      getUserMedia: false,
      mediaRecorder: false,
      supportedMimeType: null,
      canShareFiles: false,
    };
  }

  const secureContext = window.isSecureContext === true;
  const getUserMedia =
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function";
  const mediaRecorder = typeof window.MediaRecorder !== "undefined";
  const canShareFiles =
    typeof navigator.canShare === "function" &&
    typeof navigator.share === "function";

  return {
    secureContext,
    getUserMedia,
    mediaRecorder,
    supportedMimeType: mediaRecorder ? pickMimeType() : null,
    canShareFiles,
  };
}
