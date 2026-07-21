import { z } from "zod";

const formatEnum = z.enum(["video", "carousel", "post", "story", "linkedin"]);
const intensityEnum = z.enum(["light", "balanced", "intense"]);

/** Schema do onboarding editorial (MÓDULO 2). Espelha client_profiles + client_preferences. */
export const onboardingSchema = z.object({
  // Identidade
  full_name: z.string().min(2, "Informe seu nome."),
  display_name: z.string().optional().default(""),
  profession: z.string().optional().default(""),
  company: z.string().optional().default(""),
  field_of_work: z.string().optional().default(""),
  specialties: z.array(z.string()).default([]),
  city: z.string().optional().default(""),
  // Público
  target_audience: z.string().optional().default(""),
  audience_pains: z.string().optional().default(""),
  // Editorial
  goals: z.string().optional().default(""),
  main_themes: z.array(z.string()).default([]),
  forbidden_themes: z.array(z.string()).default([]),
  tone_of_voice: z.string().optional().default(""),
  channels: z.array(z.string()).default([]),
  // Operação
  video_duration_sec: z.coerce.number().int().min(10).max(600).default(60),
  preferred_formats: z.array(formatEnum).min(1).default(["video"]),
  weekly_goal: z.coerce.number().int().min(1).max(21).default(3),
  preferred_days: z.array(z.coerce.number().int().min(0).max(6)).default([1, 3, 5]),
  preferred_times: z.array(z.string()).default([]),
  // Comportamento
  main_block: z.string().optional().default(""),
  main_motivation: z.string().optional().default(""),
  follow_up_level: intensityEnum.default("balanced"),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
