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
