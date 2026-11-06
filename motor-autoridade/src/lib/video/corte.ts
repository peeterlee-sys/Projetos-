/**
 * Corte de respiração e preparo do vídeo do vereador para o WhatsApp.
 *
 * O vereador grava falando direto para o celular: sobram pausas, respiração e
 * aquele silêncio antes de ele achar a palavra. Esta parte encontra esses
 * trechos pelo nível de áudio e devolve só o que vale manter.
 *
 * As funções aqui são puras de propósito — recebem texto e números, devolvem
 * números. Quem chama o ffmpeg é `executar.ts`, que não dá para testar sem o
 * binário instalado. Assim a regra que decide o que entra e o que sai do vídeo
 * fica coberta por teste.
 */

/** Trecho de áudio abaixo do limiar de ruído, em segundos. */
export type Silencio = { inicio: number; fim: number };

/** Trecho que permanece no vídeo final, em segundos. */
export type Trecho = { inicio: number; fim: number };

/** Abaixo deste nível o ffmpeg considera silêncio. Voz de celular fica bem acima. */
export const RUIDO_PADRAO = "-32dB";

/** Pausa natural entre frases fica abaixo disto; só cortamos o que passar. */
export const MIN_SILENCIO_PADRAO = 0.4;

/** Folga nas bordas do corte, para não decepar a primeira e a última sílaba. */
export const FOLGA_PADRAO = 0.08;

/** Teto de vídeo que o WhatsApp aceita enviar. Acima disso a API recusa. */
export const LIMITE_WHATSAPP_MB = 16;

/**
 * Lê a saída do filtro `silencedetect` do ffmpeg, que escreve no stderr linhas
 * como `[silencedetect @ ...] silence_start: 6.012`.
 *
 * Um `silence_start` sem o `silence_end` correspondente significa que o vídeo
 * termina em silêncio: fecha no fim do arquivo, que o chamador informa.
 */
export function parsearSilencios(saidaFfmpeg: string, duracao: number): Silencio[] {
  const silencios: Silencio[] = [];
  let inicio: number | null = null;

  for (const linha of saidaFfmpeg.split("\n")) {
    const abre = linha.match(/silence_start:\s*(-?[\d.]+)/);
    if (abre) {
      inicio = Number.parseFloat(abre[1]);
      continue;
    }
    const fecha = linha.match(/silence_end:\s*(-?[\d.]+)/);
    if (fecha && inicio !== null) {
      silencios.push({ inicio, fim: Number.parseFloat(fecha[1]) });
      inicio = null;
    }
  }
  if (inicio !== null) silencios.push({ inicio, fim: duracao });

  return silencios;
}

/**
 * Inverte os silêncios: devolve o que fica no vídeo.
 *
 * Cada corte recua `folga` de cada lado para o resultado não soar picotado —
 * sem isso o vereador perde o começo da palavra e o vídeo fica com aquele
 * aspecto de edição malfeita que justamente queremos evitar.
 *
 * Trecho menor que um quadro é descartado: concatenar sobra de 20ms gera
 * estalo no áudio e não acrescenta nada.
 */
export function trechosParaManter(
  silencios: Silencio[],
  duracao: number,
  folga = FOLGA_PADRAO
): Trecho[] {
  const trechos: Trecho[] = [];
  let cursor = 0;

  for (const { inicio, fim } of [...silencios].sort((a, b) => a.inicio - b.inicio)) {
    // A folga protege a sílaba vizinha. Nas pontas do arquivo não há vizinha:
    // aplicar folga ali só deixaria um resto mudo no começo ou no fim.
    const corteInicio = inicio <= 0 ? 0 : Math.min(duracao, inicio + folga);
    const corteFim = fim >= duracao ? duracao : Math.min(duracao, fim - folga);
    if (corteInicio > cursor) trechos.push({ inicio: cursor, fim: corteInicio });
    cursor = Math.max(cursor, corteFim);
  }
  if (cursor < duracao) trechos.push({ inicio: cursor, fim: duracao });

  return trechos.filter((t) => t.fim - t.inicio > 0.05);
}

/** Quanto tempo sobra depois do corte. */
export function duracaoFinal(trechos: Trecho[]): number {
  return trechos.reduce((total, t) => total + (t.fim - t.inicio), 0);
}

export type Encode = {
  /** Altura alvo; a largura acompanha a proporção original. */
  altura: number;
  /** Bitrate de vídeo em kbps. */
  videoKbps: number;
  /** Bitrate de áudio em kbps. */
  audioKbps: number;
  /**
   * true quando nem no menor preset o arquivo caberia no limite: o vídeo
   * precisa ir por link em vez de anexo.
   */
  excedeWhatsApp: boolean;
};

/** Abaixo deste bitrate a cara do vereador vira bloco; melhor mandar link. */
const VIDEO_KBPS_MINIMO = 600;

/** Acima deste bitrate vale manter 1080 de altura; abaixo, 720 fica melhor. */
const VIDEO_KBPS_PARA_1080 = 1800;

/**
 * Escolhe resolução e bitrate para o vídeo caber no limite do WhatsApp.
 *
 * O limite é de tamanho, não de duração, então o cálculo parte do orçamento de
 * bits: quanto maior o vídeo, menor o bitrate que cabe. Reservamos 8% para o
 * container e a variação do encoder, que não entrega o bitrate no milímetro.
 *
 * Quando nem 600 kbps resolve, `excedeWhatsApp` avisa quem chamou para mandar
 * link em vez de anexo — melhor um link do que um vídeo ilegível.
 */
export function planejarEncode(
  duracaoSegundos: number,
  limiteMB = LIMITE_WHATSAPP_MB
): Encode {
  const audioKbps = 96;
  const segundos = Math.max(1, duracaoSegundos);
  const orcamentoKbit = (limiteMB * 1024 * 1024 * 8 * 0.92) / 1000;
  const videoKbps = Math.floor(orcamentoKbit / segundos) - audioKbps;

  if (videoKbps < VIDEO_KBPS_MINIMO) {
    return { altura: 1280, videoKbps: VIDEO_KBPS_MINIMO, audioKbps, excedeWhatsApp: true };
  }
  return {
    altura: videoKbps >= VIDEO_KBPS_PARA_1080 ? 1920 : 1280,
    videoKbps,
    audioKbps,
    excedeWhatsApp: false,
  };
}

/**
 * Monta o `filter_complex` que corta e emenda tudo numa passada só.
 *
 * Fazer em uma passada em vez de gerar um arquivo por trecho importa: um vídeo
 * com trinta pausas viraria trinta arquivos temporários e trinta encodes.
 */
export function montarFilterComplex(trechos: Trecho[]): string {
  if (trechos.length === 0) throw new Error("Nenhum trecho com áudio para manter.");

  const partes = trechos
    .map(
      ({ inicio, fim }, i) =>
        `[0:v]trim=${inicio.toFixed(3)}:${fim.toFixed(3)},setpts=PTS-STARTPTS[v${i}];` +
        `[0:a]atrim=${inicio.toFixed(3)}:${fim.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`
    )
    .join(";");
  const refs = trechos.map((_, i) => `[v${i}][a${i}]`).join("");

  return `${partes};${refs}concat=n=${trechos.length}:v=1:a=1[v][a]`;
}
