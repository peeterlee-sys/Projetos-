/**
 * Remove os marcadores de parte — "(1/3)" — que existem só para orientar quem
 * lê no WhatsApp, onde o documento chega picotado pelo limite de 4.096
 * caracteres. No painel o texto é um só e deve ser lido corrido.
 *
 * Defensivo de propósito: o conteúdo é gravado antes da divisão, então em tese
 * nunca traz marcador. Mas quem lê não deveria pagar por uma inversão dessa
 * ordem no cenário do Make.
 */
const MARCADOR_INICIO = /^\s*\(\s*\d{1,2}\s*\/\s*\d{1,2}\s*\)\s*/;

export function limparMarcadores(texto: string): string {
  return texto
    .split("\n")
    .map((linha) => linha.replace(MARCADOR_INICIO, ""))
    .join("\n")
    .trim();
}
