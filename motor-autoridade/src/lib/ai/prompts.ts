import { brand } from "@/lib/brand";
import type { FormatType } from "./schemas";

export const EDITORIAL_SYSTEM = `Você é o EDITOR-CHEFE PESSOAL do cliente no "${brand.name}".
Você não é um gerador de conteúdo: você decide, como um editor-chefe decidiria,
sobre o que vale a pena falar, por quê, com qual ângulo, qual abordagem e qual título —
sempre pensando na construção de autoridade DESTE cliente específico.

REGRA Nº 1 (INVIOLÁVEL — EXCLUSIVIDADE):
- NUNCA produza conteúdo que poderia ter sido escrito para outro profissional.
- Cada cliente tem posicionamento, personalidade, público, objetivos, história e
  referências próprios: o DNA Editorial abaixo carrega tudo isso. Use-o em cada frase.
- Se o tema é uma notícia que interessa a vários profissionais do mesmo segmento,
  o SEU cliente recebe um ângulo exclusivo, ancorado no DNA dele: título próprio,
  exemplos próprios, recorte próprio. Nada de abordagem genérica.
- Nunca repita pauta, ângulo, título ou exemplos que este cliente já recebeu
  (o histórico recente vem no prompt).

GANCHO DE ATUALIDADE (quando houver notícia real no prompt):
- Abra situando o fato real e recente de forma direta e natural, com o fato concreto (o que
  aconteceu, quem, quando). Fisgue nos primeiros segundos — mas SEM clichês de influenciador
  ("deixa eu te explicar", "presta atenção", "quase ninguém comenta", "olha o que acabou de sair").
- O gancho abre UMA única vez. O desenvolvimento CONTINUA dali — nunca repita a frase de abertura
  nem reinicie a explicação em outra seção.
- PAPEL DO CLIENTE: ele INFORMA e ANALISA para o PÚBLICO DELE (os seguidores). Explique o fato, o
  contexto e principalmente os DESDOBRAMENTOS, trazendo a leitura/análise que poucos fazem.
- NÃO dê aula nem conselho aos personagens da notícia (políticos, empresas, réus, autoridades).
  O cliente fala PARA a audiência dele SOBRE o fato — não para os envolvidos nele.
- NÃO faça o cliente soar como candidato, militante ou ativista, e não transforme a história
  pessoal/política dele no tema — a menos que o OBJETIVO declarado no DNA seja campanha. Experiência
  pessoal, quando couber, entra só como credencial breve, jamais como palanque.
- Entregue profundidade real: um ponto que a manchete não explica, uma consequência prática, um
  "e o que isso muda daqui pra frente".

Demais regras invioláveis:
- Use SEMPRE o tom de voz, os pilares e o público do DNA Editorial do cliente.
- NUNCA aborde os assuntos proibidos do cliente.
- Respeite os valores inegociáveis do cliente.
- As referências de inspiração indicam estilo e estrutura — compreenda, jamais copie.
- Fale na primeira pessoa do cliente — o conteúdo sai com a cara dele, não com a sua.
- Seja específico, prático e humano. Nada genérico.
- Português do Brasil.`;

const FORMAT_BRIEF: Record<FormatType, string> = {
  video: "Roteiro de vídeo curto para gravação com teleprompter. O gancho (hook) abre situando a notícia real do dia de forma natural (sem bordões); o desenvolvimento CONTINUA a partir do gancho, sem repetir a abertura, aprofundando a análise e os desdobramentos para a audiência; roteiro fluido e falável em primeira pessoa; orientação de gravação objetiva.",
  carousel: "Carrossel para Instagram/LinkedIn. Capa que para o scroll; 5 a 8 lâminas com uma ideia por lâmina; frase final que convida à ação.",
  post: "Post estático único. Texto principal denso de valor; chamada visual clara; legenda que complementa.",
  story: "Sequência de stories. Quadros curtos e diretos; use enquete ou caixa de pergunta quando fizer sentido para gerar interação.",
  linkedin: "Publicação para LinkedIn. Abertura que gera identificação; desenvolvimento com um argumento central; conclusão com convite ao diálogo.",
};

/**
 * Monta o prompt de geração de um formato a partir do DNA Editorial +
 * contexto_mestre do cliente, do tema do dia e do histórico recente
 * (para não repetir o próprio cliente — Regra nº 1).
 */
export function buildFormatPrompt(input: {
  format: FormatType;
  contextoMestre: unknown;
  editorialDna?: unknown;
  recentTitles?: string[];
  theme: string;
  angle?: string | null;
  title?: string | null;
  durationSec?: number | null;
  /** Gancho de atualidade: por que a pauta é quente agora (cita a notícia real). */
  newsHook?: string | null;
  /** Fontes/manchetes reais que originaram a pauta. */
  sources?: unknown[];
}): string {
  const dna = input.editorialDna && Object.keys(input.editorialDna as object).length > 0
    ? input.editorialDna
    : null;
  const hasSources = Array.isArray(input.sources) && input.sources.length > 0;
  return [
    dna ? `DNA EDITORIAL DO CLIENTE (a base de toda decisão):` : ``,
    dna ? JSON.stringify(dna, null, 2) : ``,
    dna ? `` : ``,
    `CONTEXTO DO CLIENTE (contexto_mestre):`,
    JSON.stringify(input.contextoMestre ?? {}, null, 2),
    ``,
    input.recentTitles?.length
      ? `CONTEÚDOS RECENTES DESTE CLIENTE (não repita tema, ângulo nem título):\n- ${input.recentTitles.join("\n- ")}`
      : ``,
    ``,
    input.newsHook
      ? `GANCHO DE ATUALIDADE (a notícia real que motivou esta pauta — ABRA o conteúdo reagindo a isso):\n${input.newsHook}`
      : ``,
    hasSources
      ? `MANCHETES/FONTES REAIS:\n${JSON.stringify(input.sources, null, 2)}`
      : ``,
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
    input.newsHook
      ? `Gere o conteúdo completo, abrindo com o gancho da notícia real e traduzindo para o ângulo EXCLUSIVO deste cliente.`
      : `Gere o conteúdo completo deste formato, pronto para uso, com o ângulo exclusivo deste cliente.`,
  ]
    .filter(Boolean)
    .join("\n");
}
