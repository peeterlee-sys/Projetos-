/**
 * Título de exibição a partir do texto gerado pelo WhatsApp: primeira linha
 * com conteúdo, sem os asteriscos de negrito do WhatsApp, cortada em 80
 * caracteres. Só tira `*` e `#` — o `_` precisa ficar, senão some a lacuna
 * dos documentos legislativos ("REQUERIMENTO Nº ___/2026").
 */
export function tituloFromConteudo(conteudo: string): string {
  const firstLine =
    conteudo
      .split("\n")
      .map((l) => l.replace(/[*#]/g, "").trim())
      .find((l) => l.length > 0) ?? "Documento gerado";
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}…` : firstLine;
}

/**
 * Título que aparece na lista. Documento com seções começa pelo cabeçalho
 * ("1. MATÉRIA JORNALÍSTICA"), e uma lista cheia desses rótulos repetidos não
 * diz nada sobre o que é cada peça — a manchete logo abaixo, sim.
 *
 * Vale também para o que já está gravado: o cálculo é na exibição.
 */
export function tituloDeExibicao(tituloSalvo: string, conteudo: string): string {
  if (!ehCabecalhoDeSecao(tituloSalvo)) return tituloSalvo;

  const primeiraLinhaUtil = conteudo
    .split("\n")
    .map((l) => l.replace(/[*#]/g, "").trim())
    .find((l) => l.length > 0 && !ehCabecalhoDeSecao(l));

  return primeiraLinhaUtil ? tituloFromConteudo(primeiraLinhaUtil) : tituloSalvo;
}

/** "1. MATÉRIA JORNALÍSTICA", "2. LEGENDA PARA INSTAGRAM", "1. ABERTURA"... */
function ehCabecalhoDeSecao(linha: string): boolean {
  const limpa = linha.replace(/[*#]/g, "").trim();
  const m = limpa.match(/^\d{1,2}[.)]\s*(.+)$/);
  if (!m) return false;
  const texto = m[1].trim();
  const letras = texto.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letras.length < 3) return false;
  const maiusculas = texto.replace(/[^A-ZÀ-Þ]/g, "").length;
  return maiusculas / letras.length >= 0.8;
}
