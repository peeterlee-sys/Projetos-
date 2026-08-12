export type Secao = { titulo: string; conteudo: string };

/**
 * Cabeçalho de seção como a IA escreve: "*1. LEGENDA PARA INSTAGRAM*".
 * O asterisco é o negrito do WhatsApp e pode vir ou não.
 */
const CABECALHO = /^\s*\*{0,2}\s*(\d{1,2})[.)]\s*([^*\n]{2,60}?)\s*\*{0,2}\s*$/;

/**
 * Só aceita como cabeçalho o título em caixa alta — é assim que o prompt pede.
 * Sem isso, uma linha comum do documento ("1. o vereador solicita que...")
 * viraria seção e picotaria o texto no lugar errado.
 */
function tituloDeSecao(linha: string): string | null {
  const m = linha.match(CABECALHO);
  if (!m) return null;
  const titulo = m[2].trim();
  const letras = titulo.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letras.length < 3) return null;
  const maiusculas = titulo.replace(/[^A-ZÀ-Þ]/g, "").length;
  return maiusculas / letras.length >= 0.8 ? titulo : null;
}

/**
 * Quebra o documento nas seções que a IA gera.
 *
 * Uma "matéria" chega com quatro entregas diferentes empilhadas — headline,
 * release para a imprensa, legenda de Instagram e texto de WhatsApp — e o
 * assessor precisa copiar cada uma para um lugar diferente. Separadas, cada
 * uma ganha seu próprio botão de copiar.
 *
 * Devolve lista vazia quando o texto é corrido (requerimento, projeto de lei),
 * sinalizando que ele deve ser exibido inteiro.
 */
export function dividirEmSecoes(texto: string): Secao[] {
  const secoes: Secao[] = [];
  let atual: Secao | null = null;

  for (const linha of texto.split("\n")) {
    const titulo = tituloDeSecao(linha);
    if (titulo) {
      if (atual) secoes.push(atual);
      atual = { titulo, conteudo: "" };
      continue;
    }
    if (atual) {
      atual.conteudo += (atual.conteudo ? "\n" : "") + linha;
    } else if (linha.trim()) {
      atual = { titulo: "", conteudo: linha };
    }
  }
  if (atual) secoes.push(atual);

  const limpas = secoes
    .map((s) => ({ titulo: s.titulo, conteudo: s.conteudo.trim() }))
    .filter((s) => s.conteudo);

  // Menos de duas seções tituladas não é documento estruturado — é texto
  // corrido que por acaso começa com um número.
  return limpas.filter((s) => s.titulo).length >= 2 ? limpas : [];
}
