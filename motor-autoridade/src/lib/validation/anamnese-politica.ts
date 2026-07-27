import { z } from "zod";
import { normalizePhoneBR } from "@/lib/phone";

/**
 * ANAMNESE POLÍTICA — espelha, pergunta por pergunta, o Google Form
 * "Assessor 24h - Anamnese" (6 seções). Nada aqui deve divergir do formulário
 * original sem que o cliente peça — inclusive as alternativas de cada
 * pergunta de múltipla escolha.
 */

// SEÇÃO 2 — "Como você define seu posicionamento no espectro político?"
// (o formulário original NÃO tem "centro-direita" — só estas 5 opções)
export const spectrumEnum = z.enum([
  "esquerda",
  "centro_esquerda",
  "centro",
  "direita",
  "nao_declarado",
]);
export type PoliticalSpectrum = z.infer<typeof spectrumEnum>;

export const SPECTRUM_LABEL: Record<PoliticalSpectrum, string> = {
  esquerda: "Esquerda",
  centro_esquerda: "Centro-esquerda",
  centro: "Centro",
  direita: "Direita",
  nao_declarado: "Prefiro não me posicionar no espectro",
};

// SEÇÃO 2 — "Quais são as principais bandeiras do seu mandato? (escolha até 3)"
export const FLAG_OPTIONS = [
  "Saúde",
  "Educação",
  "Segurança Pública",
  "Mobilidade urbana e trânsito",
  "Infraestrutura e obra",
  "Meio Ambiente",
  "Esporte e Lazer",
  "Cultura",
  "Assistência Social",
  "Empreendedorismo e emprego",
  "Turismo",
  "Causa Animal",
  "Fiscalização do Executivo",
  "Pautas Cristãs",
  "Família",
  "Direito das Mulheres",
  "Juventude",
  "Terceira Idade",
] as const;

// SEÇÃO 3 — "Qual estilo de comunicação mais combina com você?"
export const TONE_OPTIONS = [
  "Formal e institucional",
  "Próximo e popular, linguagem simples",
  "Combativo e fiscalizador",
  "Técnico e propositivo",
  "Inspirador e emocional",
] as const;

// SEÇÃO 3 — "Sobre gírias e expressões regionais"
// O formulário original tem um resto de edição ("Opção 3" sem texto) — aqui
// consolidado em 3 alternativas reais, conforme confirmado com o cliente.
export const SLANG_OPTIONS = [
  "Pode usar à vontade, faz parte do meu jeito",
  "Usar com moderação",
  "Evitar totalmente",
] as const;

// SEÇÃO 3 — "Sobre emojis nas publicações"
export const EMOJI_OPTIONS = [
  "Gosto de bastante emoji 😀🎉💪",
  "Poucos e pontuais",
  "Não usar emojis",
] as const;

// SEÇÃO 3 — "Nos textos em terceira pessoa (releases, matérias), como devemos
// nos referir a você?"
export const HOW_TO_REFER_OPTIONS = [
  'O vereador + nome político (ex.: "o vereador João da Farmácia")',
  "Apenas o nome político",
  'Título profissional + nome (ex.: "o professor João", "a doutora Ana")',
] as const;

// SEÇÃO 4 — "Qual é a sua relação com o atual prefeito?"
export const MAYOR_RELATION_OPTIONS = [
  "Base aliada - apoio ao governo",
  "Independente — avalio caso a caso",
  "Oposição — fiscalizo e critico o governo",
] as const;

// SEÇÃO 1 — "Este é o seu..."
export const MANDATE_OPTIONS = ["1º mandato", "2º mandato", "3º mandato ou mais"] as const;

/** Telefone do WhatsApp: obrigatório e sempre gravado em forma canônica. */
const phoneSchema = z
  .string()
  .min(8, "Informe o WhatsApp que será usado no Assessor 24h.")
  .transform((v) => normalizePhoneBR(v))
  .refine((v): v is string => Boolean(v), {
    message: "WhatsApp inválido. Use DDD + número, ex.: (47) 99184-8380.",
  });

export const anamnesePoliticaSchema = z.object({
  // SEÇÃO 1 — Identificação
  full_name: z.string().min(2, "Informe o nome completo."),
  political_name: z.string().min(2, "Informe o nome político."),
  city: z.string().min(2, "Informe a cidade."),
  state: z.string().min(2, "Informe a UF.").max(2, "Use a sigla da UF, ex.: SC."),
  party: z.string().min(1, "Informe o partido atual."),
  mandate: z.enum(MANDATE_OPTIONS, { message: "Selecione o número do mandato." }),
  positions: z.array(z.string()).min(1, 'Preencha os cargos — se não tiver, escreva "Nenhum".'),
  phone: phoneSchema,

  // SEÇÃO 2 — Posicionamento político
  political_spectrum: spectrumEnum,
  flags: z.array(z.enum(FLAG_OPTIONS)).min(1, "Escolha ao menos 1 bandeira.").max(3, "Escolha até 3 bandeiras."),
  electoral_base: z.string().min(1, "Informe os bairros ou regiões da sua base eleitoral."),
  voter_profile: z.string().min(1, "Descreva o perfil predominante do seu eleitorado."),

  // SEÇÃO 3 — Tom e estilo de comunicação
  tone_of_voice: z.enum(TONE_OPTIONS, { message: "Selecione o estilo de comunicação." }),
  slang_style: z.enum(SLANG_OPTIONS, { message: "Selecione uma opção sobre gírias." }),
  emoji_style: z.enum(EMOJI_OPTIONS, { message: "Selecione uma opção sobre emojis." }),
  how_to_refer: z.enum(HOW_TO_REFER_OPTIONS, { message: "Selecione como devemos nos referir a você." }),
  catchphrase: z.string().min(1, 'Preencha o bordão — se não tiver, escreva "Não".'),

  // SEÇÃO 4 — Limites e cuidados
  forbidden_themes: z
    .array(z.string())
    .min(1, 'Preencha os temas proibidos — se não houver, escreva "Nenhum".'),
  adversaries: z
    .array(z.string())
    .min(1, 'Preencha os adversários — se não houver, escreva "Nenhum".'),
  mayor_relation: z.enum(MAYOR_RELATION_OPTIONS, {
    message: "Selecione sua relação com o atual prefeito.",
  }),
  history_to_avoid: z.string().min(1, 'Preencha o histórico a evitar — se não houver, escreva "Nenhum".'),

  // SEÇÃO 5 — Referências (nenhuma obrigatória, igual ao formulário original)
  instagram_url: z.string().optional().default(""),
  website_url: z.string().optional().default(""),
  reference_publications: z.array(z.string()).default([]),
  local_press: z.array(z.string()).default([]),

  // SEÇÃO 6 — Consentimento (LGPD)
  lgpd_consent: z
    .boolean()
    .refine((v) => v === true, { message: "É preciso aceitar o termo de consentimento para enviar a anamnese." }),
});

export type AnamnesePoliticaInput = z.input<typeof anamnesePoliticaSchema>;
export type AnamnesePoliticaData = z.output<typeof anamnesePoliticaSchema>;
