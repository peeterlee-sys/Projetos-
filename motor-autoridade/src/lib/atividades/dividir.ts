/** Limite de caracteres de uma mensagem de texto do WhatsApp. */
export const LIMITE_WHATSAPP = 4096;

/** Espaço reservado para o marcador "(12/12) " no começo de cada parte. */
const RESERVA_MARCADOR = 12;

/**
 * Divide o documento gerado em partes que cabem numa mensagem do WhatsApp.
 *
 * Um projeto de lei com justificativa passa de 10 mil caracteres, e o WhatsApp
 * recusa qualquer texto acima de LIMITE_WHATSAPP — antes disso existir, o envio
 * simplesmente falhava e o vereador não recebia nada.
 *
 * O corte respeita a estrutura do documento: primeiro tenta fechar em parágrafo,
 * depois em linha, e só corta no meio do texto se uma linha sozinha estourar o
 * limite. Documento que já cabe volta inteiro, sem marcador.
 */
export function dividirParaWhatsApp(texto: string, limite = LIMITE_WHATSAPP): string[] {
  const conteudo = texto.trim();
  if (!conteudo) return [];
  if (conteudo.length <= limite) return [conteudo];

  const blocos = agruparBlocos(conteudo, limite - RESERVA_MARCADOR);
  return blocos.map((bloco, i) => `(${i + 1}/${blocos.length}) ${bloco}`);
}

/** Junta parágrafos enquanto couberem; abre uma parte nova quando estourar. */
function agruparBlocos(texto: string, max: number): string[] {
  const partes: string[] = [];
  let atual = "";

  for (const paragrafo of texto.split("\n\n")) {
    for (const pedaco of fatiarParagrafoLongo(paragrafo, max)) {
      const junto = atual ? `${atual}\n\n${pedaco}` : pedaco;
      if (junto.length <= max) {
        atual = junto;
      } else {
        if (atual) partes.push(atual);
        atual = pedaco;
      }
    }
  }
  if (atual) partes.push(atual);
  return partes;
}

/** Parágrafo maior que o limite: quebra por linha e, em último caso, no seco. */
function fatiarParagrafoLongo(paragrafo: string, max: number): string[] {
  if (paragrafo.length <= max) return [paragrafo];

  const pedacos: string[] = [];
  let atual = "";

  for (const linha of paragrafo.split("\n")) {
    const junto = atual ? `${atual}\n${linha}` : linha;
    if (junto.length <= max) {
      atual = junto;
      continue;
    }
    if (atual) {
      pedacos.push(atual);
      atual = "";
    }
    if (linha.length <= max) {
      atual = linha;
    } else {
      for (let i = 0; i < linha.length; i += max) pedacos.push(linha.slice(i, i + max));
    }
  }
  if (atual) pedacos.push(atual);
  return pedacos;
}
