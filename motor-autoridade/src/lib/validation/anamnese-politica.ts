import { z } from "zod";
import { normalizePhoneBR } from "@/lib/phone";
import { influenceSourceSchema, inspirationRefSchema } from "./onboarding";

export const spectrumEnum = z.enum([
  "esquerda",
  "centro_esquerda",
  "centro",
  "centro_direita",
  "direita",
  "nao_declarado",
]);
export type PoliticalSpectrum = z.infer<typeof spectrumEnum>;

const formatEnum = z.enum(["video", "carousel", "post", "story", "linkedin"]);

/** Telefone do WhatsApp: obrigatório e sempre gravado em forma canônica. */
const phoneSchema = z
  .string()
  .min(8, "Informe o WhatsApp do mandato.")
  .transform((v) => normalizePhoneBR(v))
  .refine((v): v is string => Boolean(v), {
    message: "WhatsApp inválido. Use DDD + número, ex.: (47) 99184-8380.",
  });

/**
 * ANAMNESE POLÍTICA (Assessor 24h) — o questionário do vereador, em 8 etapas.
 * Espelha client_profiles (trilha 'political') + client_preferences +
 * influence_sources + inspiration_refs. É a matéria-prima do DNA Editorial
 * que o assistente do WhatsApp consome a cada resposta.
 */
export const anamnesePoliticaSchema = z.object({
  // 1. Identificação
  full_name: z.string().min(2, "Informe o nome completo."),
  political_name: z.string().min(2, "Informe o nome de urna."),
  phone: phoneSchema,
  city: z.string().min(2, "Informe a cidade."),
  state: z.string().min(2, "Informe a UF.").max(2, "Use a sigla da UF, ex.: SC."),
  party: z.string().optional().default(""),
  mandate: z.string().optional().default(""),
  positions: z.array(z.string()).default([]),
  local_context: z.string().optional().default(""),

  // 2. Posicionamento
  political_spectrum: spectrumEnum.default("nao_declarado"),
  flags: z.array(z.string()).default([]),
  electoral_base: z.string().optional().default(""),
  voter_profile: z.string().optional().default(""),
  audience_pains: z.string().optional().default(""),
  positioning_recognition: z.string().optional().default(""),

  // 3. Tom e estilo
  tone_profile: z.array(z.string()).default([]),
  tone_of_voice: z.string().optional().default(""),
  slang_expressions: z.array(z.string()).default([]),
  emojis: z.array(z.string()).default([]),
  how_to_refer: z.string().optional().default(""),
  catchphrase: z.string().optional().default(""),

  // 4. Limites
  forbidden_themes: z.array(z.string()).default([]),
  adversaries: z.array(z.string()).default([]),
  mayor_relation: z.string().optional().default(""),
  history_to_avoid: z.string().optional().default(""),
  core_values: z.string().optional().default(""),

  // 5. Referências
  instagram_url: z.string().optional().default(""),
  website_url: z.string().optional().default(""),
  reference_publications: z.array(z.string()).default([]),
  local_press: z.array(z.string()).default([]),
  inspiration_refs: z.array(inspirationRefSchema).max(10).default([]),

  // 6. Influências (até 80 fontes)
  influence_sources: z.array(influenceSourceSchema).max(80).default([]),
  blocked_sources: z.string().optional().default(""),

  // 7. Preferências
  main_themes: z.array(z.string()).default([]),
  audience_segments: z.array(z.string()).default([]),
  preferred_formats: z.array(formatEnum).min(1).default(["video"]),
  publish_days_per_week: z.coerce.number().int().min(1).max(7).default(3),
  weekly_goal: z.coerce.number().int().min(1).max(21).default(3),
  preferred_days: z.array(z.coerce.number().int().min(0).max(6)).default([1, 3, 5]),
  video_duration_sec: z.coerce.number().int().min(10).max(600).default(60),
  follow_up_level: z.enum(["light", "balanced", "intense"]).default("balanced"),
});

export type AnamnesePoliticaInput = z.input<typeof anamnesePoliticaSchema>;
export type AnamnesePoliticaData = z.output<typeof anamnesePoliticaSchema>;

export const SPECTRUM_LABEL: Record<PoliticalSpectrum, string> = {
  esquerda: "Esquerda",
  centro_esquerda: "Centro-esquerda",
  centro: "Centro",
  centro_direita: "Centro-direita",
  direita: "Direita",
  nao_declarado: "Prefiro não declarar",
};
