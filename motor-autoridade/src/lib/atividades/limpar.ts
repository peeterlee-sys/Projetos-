/**
 * Tira do texto as marcas que existem só para a entrega no WhatsApp, onde o
 * documento chega picotado pelo limite de 4.096 caracteres por mensagem.
 *
 * A IA é instruída a inserir `---CORTE---` sozinha numa linha quando passa de
 * 3.500 caracteres, e o Make divide as mensagens por ali. No painel o texto é
 * um só e precisa ser lido corrido — a marca ali é ruído, e ia junto ao copiar.
 */
const MARCA_CORTE = /^[ \t]*-{2,}[ \t]*CORTE[ \t]*-{2,}[ \t]*$/i;
const MARCADOR_PARTE = /^\s*\(\s*\d{1,2}\s*\/\s*\d{1,2}\s*\)\s*/;

export function limparMarcadores(texto: string): string {
  const linhas = texto
    .split("\n")
    .filter((linha) => !MARCA_CORTE.test(linha))
    .map((linha) => linha.replace(MARCADOR_PARTE, ""));

  // Tirar a marca deixa duas linhas em branco coladas onde havia uma; sem isto
  // o documento fica com buracos no lugar de cada corte.
  return linhas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
