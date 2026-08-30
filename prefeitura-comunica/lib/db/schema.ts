import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const now = sql`(unixepoch())`;

/**
 * Prefeituras = tenants. Cada prefeitura é um cliente isolado.
 */
export const prefeituras = sqliteTable("prefeituras", {
  id: text("id").primaryKey(),
  nome: text("nome").notNull(), // "Prefeitura de Itapema"
  municipio: text("municipio").notNull(), // "Itapema"
  uf: text("uf").notNull().default("SC"),
  slug: text("slug").notNull().unique(), // "itapema"
  ativo: integer("ativo", { mode: "boolean" }).notNull().default(true),
  criadoEm: integer("criado_em", { mode: "timestamp" }).notNull().default(now),
});

/**
 * Usuários de login. Papel "admin" (dono do sistema, sem prefeitura)
 * ou "comunicacao" (equipe de uma prefeitura específica).
 */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  prefeituraId: text("prefeitura_id").references(() => prefeituras.id),
  nome: text("nome").notNull(),
  email: text("email").notNull().unique(),
  senhaHash: text("senha_hash").notNull(),
  papel: text("papel", { enum: ["admin", "comunicacao"] }).notNull().default("comunicacao"),
  ativo: integer("ativo", { mode: "boolean" }).notNull().default(true),
  criadoEm: integer("criado_em", { mode: "timestamp" }).notNull().default(now),
});

/**
 * Secretários cadastrados. É o telefone daqui que o sistema reconhece no WhatsApp.
 */
export const secretarios = sqliteTable("secretarios", {
  id: text("id").primaryKey(),
  prefeituraId: text("prefeitura_id").notNull().references(() => prefeituras.id),
  nome: text("nome").notNull(),
  cargo: text("cargo"),
  secretaria: text("secretaria"),
  telefone: text("telefone").notNull(), // normalizado: 5547999999999
  ativo: integer("ativo", { mode: "boolean" }).notNull().default(true),
  criadoEm: integer("criado_em", { mode: "timestamp" }).notNull().default(now),
});

/**
 * Contexto (anamnese) da cidade/gestão. 1 por prefeitura.
 * É o que a IA usa para escrever no tom certo.
 */
export const contextos = sqliteTable("contextos", {
  id: text("id").primaryKey(),
  prefeituraId: text("prefeitura_id").notNull().unique().references(() => prefeituras.id),
  prefeito: text("prefeito"),
  vice: text("vice"),
  mandato: text("mandato"),
  lema: text("lema"),
  programa: text("programa"),
  tom: text("tom"),
  hashtags: text("hashtags"),
  bairros: text("bairros"),
  programas: text("programas"),
  contexto: text("contexto"),
  modelos: text("modelos", { mode: "json" }).$type<string[]>().default([]),
  atualizadoEm: integer("atualizado_em", { mode: "timestamp" }).notNull().default(now),
});

/**
 * Releases gerados pela IA a partir das mensagens dos secretários.
 */
export const releases = sqliteTable("releases", {
  id: text("id").primaryKey(),
  prefeituraId: text("prefeitura_id").notNull().references(() => prefeituras.id),
  secretarioId: text("secretario_id").references(() => secretarios.id),
  secretarioNome: text("secretario_nome"),
  secretaria: text("secretaria"),
  origem: text("origem", { enum: ["audio", "texto", "foto"] }).default("audio"),
  transcricao: text("transcricao"),
  headline: text("headline"),
  release: text("release_body"),
  instagram: text("instagram"),
  status: text("status", {
    enum: ["pendente", "revisao", "aprovado", "publicado", "aguardando"],
  }).notNull().default("pendente"),
  flag: integer("flag", { mode: "boolean" }).default(false),
  aguardando: integer("aguardando", { mode: "boolean" }).default(false),
  askMsg: text("ask_msg"),
  caso: text("caso"), // sem-contexto | fora-janela
  publicadoEm: integer("publicado_em", { mode: "timestamp" }),
  criadoEm: integer("criado_em", { mode: "timestamp" }).notNull().default(now),
  atualizadoEm: integer("atualizado_em", { mode: "timestamp" }).notNull().default(now),
});

/**
 * Fotos enviadas pelos secretários, vinculadas a um release.
 */
export const fotos = sqliteTable("fotos", {
  id: text("id").primaryKey(),
  releaseId: text("release_id").notNull().references(() => releases.id),
  prefeituraId: text("prefeitura_id").notNull().references(() => prefeituras.id),
  url: text("url"),
  legenda: text("legenda"),
  criadoEm: integer("criado_em", { mode: "timestamp" }).notNull().default(now),
});

/**
 * Inscrições de notificação push (Web Push) da equipe de comunicação.
 * Cada aparelho que "instala" o app e ativa notificações vira uma linha.
 */
export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: text("id").primaryKey(),
  prefeituraId: text("prefeitura_id").notNull().references(() => prefeituras.id),
  userId: text("user_id").references(() => users.id),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  criadoEm: integer("criado_em", { mode: "timestamp" }).notNull().default(now),
});

export type Prefeitura = typeof prefeituras.$inferSelect;
export type User = typeof users.$inferSelect;
export type Secretario = typeof secretarios.$inferSelect;
export type Contexto = typeof contextos.$inferSelect;
export type Release = typeof releases.$inferSelect;
export type Foto = typeof fotos.$inferSelect;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
