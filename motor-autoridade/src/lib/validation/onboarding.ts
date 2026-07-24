import { z } from "zod";

const formatEnum = z.enum(["video", "carousel", "post", "story", "linkedin"]);
const intensityEnum = z.enum(["light", "balanced", "intense"]);

export const priorityEnum = z.enum(["high", "medium", "low"]);
export const influenceKindEnum = z.enum([
  "site", "blog", "newsletter", "podcast", "youtube",
  "instagram", "linkedin", "journalist", "expert", "author", "other",
]);
export const referenceKindEnum = z.enum(["instagram", "linkedin", "youtube", "site", "blog"]);

/** Fonte de influência informada na anamnese (etapa 7). */
export const influenceSourceSchema = z.object({
  kind: influenceKindEnum,
  label: z.string().optional().default(""),
  url: z.string().optional().default(""),
  priority: priorityEnum.default("medium"),
  is_blocked: z.boolean().default(false),
});
export type InfluenceSourceInput = z.infer<typeof influenceSourceSchema>;

/** Referência de inspiração (etapa 8) — até 10 links. */
export const inspirationRefSchema = z.object({
  kind: referenceKindEnum,
  url: z.string().min(4, "Informe o link da referência."),
  name: z.string().optional().default(""),
});
export type InspirationRefInput = z.infer<typeof inspirationRefSchema>;

/**
 * Schema da ANAMNESE EDITORIAL — substitui o onboarding curto.
 * Espelha client_profiles + client_preferences + influence_sources +
 * inspiration_refs. É a matéria-prima do DNA Editorial.
 */
export const onboardingSchema = z.object({
  // 1. Identidade
  full_name: z.string().min(2, "Informe seu nome."),
  display_name: z.string().optional().default(""),
  profession: z.string().optional().default(""),
  company: z.string().optional().default(""),
  field_of_work: z.string().optional().default(""),
  specialties: z.array(z.string()).default([]),
  city: z.string().optional().default(""),
  state: z.string().optional().default(""),
  years_experience: z.string().optional().default(""),
  bio_summary: z.string().optional().default(""),
  differentials: z.string().optional().default(""),
  segment: z.string().optional().default(""),
  // 2. Objetivo (múltipla escolha)
  objectives: z.array(z.string()).default([]),
  objective_other: z.string().optional().default(""),
  goals: z.string().optional().default(""),
  // 3. Público
  target_audience: z.string().optional().default(""),
  audience_age: z.string().optional().default(""),
  audience_city: z.string().optional().default(""),
  audience_class: z.string().optional().default(""),
  audience_profession: z.string().optional().default(""),
  audience_pains: z.string().optional().default(""),
  audience_doubts: z.string().optional().default(""),
  audience_objections: z.string().optional().default(""),
  // 4. Posicionamento
  positioning_recognition: z.string().optional().default(""),
  main_themes: z.array(z.string()).default([]),           // assuntos que deseja dominar
  forbidden_themes: z.array(z.string()).default([]),       // assuntos que NÃO deseja abordar
  core_values: z.string().optional().default(""),
  desired_description: z.string().optional().default(""),
  // 5. Tom de comunicação (múltipla escolha)
  tone_profile: z.array(z.string()).default([]),
  tone_of_voice: z.string().optional().default(""),
  // 6. Produção
  publish_days_per_week: z.coerce.number().int().min(1).max(7).default(3),
  preferred_formats: z.array(formatEnum).min(1).default(["video"]),
  time_per_day: z.string().optional().default(""),
  likes_video: z.boolean().nullable().default(null),
  records_alone: z.boolean().nullable().default(null),
  has_team: z.boolean().nullable().default(null),
  video_duration_sec: z.coerce.number().int().min(10).max(600).default(60),
  weekly_goal: z.coerce.number().int().min(1).max(21).default(3),
  preferred_days: z.array(z.coerce.number().int().min(0).max(6)).default([1, 3, 5]),
  preferred_times: z.array(z.string()).default([]),
  channels: z.array(z.string()).default([]),
  // 7. Fontes de influência (até 10 por tipo; teto amplo no total)
  influence_sources: z.array(influenceSourceSchema).max(80).default([]),
  blocked_sources: z.string().optional().default(""),      // fontes que NÃO usar (texto livre)
  // 8. Referências de inspiração (até 10)
  inspiration_refs: z.array(inspirationRefSchema).max(10).default([]),
  // Comportamento (mantido do onboarding original)
  main_block: z.string().optional().default(""),
  main_motivation: z.string().optional().default(""),
  follow_up_level: intensityEnum.default("balanced"),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
