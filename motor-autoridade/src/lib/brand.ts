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
  },

  assessor24h: {
    id: "assessor24h",
    name: "Assessor 24h",
    wordmark: { lead: "Assessor", accent: "24h" },
    wordmarkScale: 0.52,
    tagline: "A comunicação do seu mandato, todo dia.",
    description:
      "O assessor de comunicação do mandato: pauta do dia, conteúdo na sua voz e resposta no WhatsApp — 24 horas por dia.",
    audience: "vereador",
    defaultTrack: "political",
    landing: {
      eyebrow: "O assessor que não dorme",
      title: ["Mandato que fala", "com o povo todo dia."],
      subtitle:
        "O Assessor 24h acompanha a sua cidade, entrega a pauta certa do dia e escreve na sua voz — com as suas bandeiras, o seu jeito de falar e os seus limites.",
      steps: [
        {
          title: "Anamnese do mandato",
          body: "Oito etapas para registrar bandeiras, base eleitoral, jeito de falar e o que nunca pode aparecer. A IA transforma tudo no DNA do seu mandato.",
        },
        {
          title: "Pauta da sua cidade",
          body: "Todo dia útil, o que está acontecendo no município traduzido para o ângulo do seu mandato — nunca a mesma pauta de outro vereador.",
        },
        {
          title: "Conteúdo e resposta",
          body: "Roteiro, carrossel, post e story prontos para gravar, mais o assistente respondendo no WhatsApp com a sua voz.",
        },
      ],
      closing: {
        title: "Pronto para ser lembrado o ano inteiro?",
        body: "Responda a anamnese do mandato. Em minutos, o Assessor 24h já sabe falar como você.",
      },
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
