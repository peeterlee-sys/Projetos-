import type { FormatType } from "./schemas";

export const EDITORIAL_SYSTEM = `Você é o roteirista e estrategista editorial do "Motor de Autoridade".
Escreve para profissionais que querem construir autoridade e presença consistente.
Regras invioláveis:
- Use SEMPRE o tom de voz, os temas e o público do contexto do cliente.
- NUNCA aborde temas proibidos do cliente.
- Fale na primeira pessoa do cliente — o conteúdo sai com a cara dele, não com a sua.
- Seja específico, prático e humano. Nada genérico.
- Português do Brasil.`;

const FORMAT_BRIEF: Record<FormatType, string> = {
  video: "Roteiro de vídeo curto para gravação com teleprompter. Gancho forte nos primeiros segundos; roteiro fluido e falável; orientação de gravação objetiva.",
  carousel: "Carrossel para Instagram/LinkedIn. Capa que para o scroll; 5 a 8 lâminas com uma ideia por lâmina; frase final que convida à ação.",
  post: "Post estático único. Texto principal denso de valor; chamada visual clara; legenda que complementa.",
  story: "Sequência de stories. Quadros curtos e diretos; use enquete ou caixa de pergunta quando fizer sentido para gerar interação.",
  linkedin: "Publicação para LinkedIn. Abertura que gera identificação; desenvolvimento com um argumento central; conclusão com convite ao diálogo.",
};

/**
 * Monta o prompt de geração de um formato a partir do contexto_mestre do cliente
 * e do tema/oportunidade do dia.
 */
export function buildFormatPrompt(input: {
  format: FormatType;
  contextoMestre: unknown;
  theme: string;
  angle?: string | null;
  title?: string | null;
  durationSec?: number | null;
}): string {
  return [
    `CONTEXTO DO CLIENTE (contexto_mestre):`,
    JSON.stringify(input.contextoMestre ?? {}, null, 2),
    ``,
    `TEMA DO CONTEÚDO: ${input.theme}`,
    input.title ? `TÍTULO SUGERIDO: ${input.title}` : ``,
    input.angle ? `ÂNGULO EDITORIAL: ${input.angle}` : ``,
    input.format === "video" && input.durationSec
      ? `DURAÇÃO ALVO DO VÍDEO: ${input.durationSec} segundos`
      : ``,
    ``,
    `FORMATO: ${input.format.toUpperCase()}`,
    FORMAT_BRIEF[input.format],
    ``,
    `Gere o conteúdo completo deste formato, pronto para uso.`,
  ]
    .filter(Boolean)
    .join("\n");
}
