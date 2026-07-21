import { z } from "zod";

/** Formatos suportados (MÓDULO 4). */
export const FORMATS = ["video", "carousel", "post", "story", "linkedin"] as const;
export type FormatType = (typeof FORMATS)[number];

// ── Vídeo (roteiro) ──────────────────────────────────────────────────────────
export const videoSchema = z.object({
  title: z.string(),
  cover_text: z.string(),
  hook: z.string(),
  body: z.string(),
  caption: z.string(),
  cta: z.string(),
  recording_tips: z.string(),
  duration_sec: z.number().int(),
});
export type VideoPayload = z.infer<typeof videoSchema>;

// ── Carrossel ────────────────────────────────────────────────────────────────
export const carouselSchema = z.object({
  cover: z.string(),
  slides: z.array(z.object({ headline: z.string(), phrase: z.string() })).min(3).max(10),
  final_text: z.string(),
  cta: z.string(),
  caption: z.string(),
});
export type CarouselPayload = z.infer<typeof carouselSchema>;

// ── Post estático ────────────────────────────────────────────────────────────
export const postSchema = z.object({
  main_text: z.string(),
  visual_call: z.string(),
  caption: z.string(),
  cta: z.string(),
  image_suggestion: z.string(),
});
export type PostPayload = z.infer<typeof postSchema>;

// ── Story ────────────────────────────────────────────────────────────────────
export const storySchema = z.object({
  sequence: z.array(z.object({ text: z.string() })).min(1),
  poll: z.object({ question: z.string(), options: z.array(z.string()).min(2).max(4) }).nullable(),
  question_box: z.string().nullable(),
  cta: z.string(),
});
export type StoryPayload = z.infer<typeof storySchema>;

// ── LinkedIn ─────────────────────────────────────────────────────────────────
export const linkedinSchema = z.object({
  title: z.string(),
  intro: z.string(),
  body: z.string(),
  conclusion: z.string(),
  cta: z.string(),
});
export type LinkedinPayload = z.infer<typeof linkedinSchema>;

export const FORMAT_SCHEMAS = {
  video: videoSchema,
  carousel: carouselSchema,
  post: postSchema,
  story: storySchema,
  linkedin: linkedinSchema,
} as const;

/** JSON Schemas (compactos) por formato, para orientar a saída do provedor. */
export const FORMAT_JSON_SCHEMAS: Record<FormatType, Record<string, unknown>> = {
  video: {
    title: "string",
    cover_text: "string",
    hook: "string",
    body: "roteiro completo para gravar",
    caption: "legenda para a publicação",
    cta: "string",
    recording_tips: "orientação de gravação",
    duration_sec: "número inteiro (segundos)",
  },
  carousel: {
    cover: "texto de capa",
    slides: [{ headline: "string", phrase: "frase do slide" }],
    final_text: "texto final",
    cta: "string",
    caption: "legenda",
  },
  post: {
    main_text: "texto principal",
    visual_call: "chamada visual",
    caption: "legenda",
    cta: "string",
    image_suggestion: "sugestão de imagem",
  },
  story: {
    sequence: [{ text: "texto do quadro" }],
    poll: { question: "string", options: ["opção"] },
    question_box: "pergunta (ou null)",
    cta: "string",
  },
  linkedin: {
    title: "string",
    intro: "string",
    body: "desenvolvimento",
    conclusion: "conclusão",
    cta: "string",
  },
};
