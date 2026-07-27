/**
 * MARCA DO DEPLOY.
 *
 * A mesma base de código roda dois produtos independentes, cada um no seu
 * projeto (domínio, banco e clientes próprios) — o que muda é a variável
 * `NEXT_PUBLIC_BRAND` no ambiente:
 *
 *   NEXT_PUBLIC_BRAND=take         → Take (profissionais)      [padrão]
 *   NEXT_PUBLIC_BRAND=assessor24h  → Assessor 24h (mandatos)
 *
 * Sem a variável, é Take — nenhum deploy existente muda de comportamento.
 */

export type BrandId = "take" | "assessor24h";

/** Trilha de anamnese que a marca usa por padrão. */
export type AnamneseTrack = "generic" | "political";

export type Brand = {
  id: BrandId;
  /** Nome do produto, usado em títulos, PWA e prompts de IA. */
  name: string;
  /** Logotipo: parte principal + parte em destaque (dourado). */
  wordmark: { lead: string; accent: string };
  /** Proporção do logotipo em relação ao ícone (nomes longos pedem menos). */
  wordmarkScale: number;
  tagline: string;
  description: string;
  /** Como o público é chamado nas telas. */
  audience: string;
  /** Trilha padrão: no Assessor 24h todo cliente é mandato. */
  defaultTrack: AnamneseTrack;
  landing: {
    eyebrow: string;
    title: string[];
    subtitle: string;
    steps: { title: string; body: string }[];
    closing: { title: string; body: string };
  };
  /** Tela exibida logo após concluir a anamnese (antes de liberar o app). */
  thankYou: { title: string; body: string };
  /** Número do assistente no WhatsApp (CTA na tela de agradecimento). */
  whatsapp?: { number: string; message: string };
};

const BRANDS: Record<BrandId, Brand> = {
  take: {
    id: "take",
    name: "Take",
    wordmark: { lead: "Take", accent: "." },
    wordmarkScale: 0.82,
    tagline: "Sua presença editorial, do radar à publicação.",
    description:
      "Seu editor-chefe inteligente: do radar de pautas à gravação e publicação, com a sua cara.",
    audience: "cliente",
    defaultTrack: "generic",
    landing: {
      eyebrow: "Seu editor-chefe inteligente",
      title: ["Autoridade se constrói", "publicando todo dia."],
      subtitle:
        "O Take entrega a pauta certa por dia, transforma em conteúdo com a sua voz e te leva da ideia à publicação — sem depender de inspiração.",
      steps: [
        {
          title: "Pauta do dia",
          body: "Todo dia útil, seu editor-chefe decide sobre o que vale a pena falar — no seu tom, para o seu público.",
        },
        {
          title: "Conteúdo em 5 formatos",
          body: "Roteiro de vídeo, carrossel, post, story e LinkedIn gerados com a sua cara, a partir de uma única pauta.",
        },
        {
          title: "Grave e publique",
          body: "Teleprompter para gravar, legenda pronta para copiar e acompanhamento da sua meta da semana.",
        },
      ],
      closing: {
        title: "Pronto para virar referência?",
        body: "Crie sua conta e responda a anamnese editorial. Em minutos, seu DNA de conteúdo está pronto.",
      },
    },
    thankYou: {
      title: "Prontinho — seu DNA editorial está pronto.",
      body: "A partir de agora, o Take entrega a pauta certa todo dia útil, com a sua cara.",
    },
  },

  // Textos e identidade espelham o site assessor24h.ia.br.
  assessor24h: {
    id: "assessor24h",
    name: "Assessor 24h",
    wordmark: { lead: "Assessor ", accent: "24h" },
    wordmarkScale: 0.5,
    tagline: "Comunicação e inteligência legislativa para vereadores.",
    description:
      "Transforme áudios, textos, ideias e discursos em comunicação profissional e produção legislativa, diretamente pelo WhatsApp.",
    audience: "vereador",
    defaultTrack: "political",
    landing: {
      eyebrow: "Comunicação e inteligência legislativa",
      title: ["Seu gabinete pode produzir mais,", "comunicar melhor e responder mais rápido."],
      subtitle:
        "Transforme áudios, textos, ideias e discursos em comunicação profissional e produção legislativa, diretamente pelo WhatsApp.",
      steps: [
        {
          title: "Envie uma mensagem",
          body: "O vereador fala naturalmente, por áudio ou texto. Não precisa escrever perfeitamente — o sistema organiza rascunhos, anotações e ideias soltas.",
        },
        {
          title: "Escolha o que precisa",
          body: "Requerimento, projeto de lei, discurso na tribuna, matéria jornalística ou publicação para as redes: o Assessor 24h monta o material.",
        },
        {
          title: "Receba pronto para usar",
          body: "Volta estruturado e na linguagem do mandato — com o pedido, a justificativa e o direcionamento certos.",
        },
      ],
      closing: {
        title: "Comece pela anamnese do mandato",
        body: "São 6 seções rápidas. É o que ensina o Assessor 24h a falar como você: suas bandeiras, seu jeito de falar e os seus limites.",
      },
    },
    thankYou: {
      title: "Muito obrigado — seu mandato já tem um assessor 24 horas por dia.",
      body: "A partir de agora, é só chamar no WhatsApp: peça um requerimento, um discurso ou uma matéria para a imprensa, e receba pronto, na sua voz. Sem esperar, sem depender de ninguém — o Assessor 24h nunca dorme.",
    },
    whatsapp: {
      number: "5547999692321",
      message: "Olá! Acabei de concluir minha anamnese no Assessor 24h.",
    },
  },
};

function resolveBrand(): Brand {
  const id = process.env.NEXT_PUBLIC_BRAND as BrandId | undefined;
  return id && id in BRANDS ? BRANDS[id] : BRANDS.take;
}

/** Marca deste deploy. Fixa em tempo de build (NEXT_PUBLIC_*). */
export const brand: Brand = resolveBrand();

/** Onde começa a anamnese nesta marca. */
export const anamneseHref =
  brand.defaultTrack === "political" ? "/onboarding/politico" : "/onboarding";
