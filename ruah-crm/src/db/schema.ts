import { sql } from "drizzle-orm";
import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";

/**
 * Estagios do funil de vendas da Ruah, nesta ordem.
 */
export const ESTAGIOS = [
  "a_prospectar",
  "contato_feito",
  "interesse_confirmado",
  "proposta_enviada",
  "fechado",
] as const;

export type Estagio = (typeof ESTAGIOS)[number];

export const ESTAGIO_LABELS: Record<Estagio, string> = {
  a_prospectar: "A Prospectar",
  contato_feito: "Contato Feito",
  interesse_confirmado: "Interesse Confirmado",
  proposta_enviada: "Proposta Enviada",
  fechado: "Fechado",
};

export const CANAIS_ALERTA = ["whatsapp", "email", "ambos"] as const;
export type CanalAlerta = (typeof CANAIS_ALERTA)[number];

export const STATUS_LEMBRETE = ["pendente", "enviado", "cancelado", "erro"] as const;
export type StatusLembrete = (typeof STATUS_LEMBRETE)[number];

export const TIPOS_HISTORICO = [
  "nota",
  "mudanca_estagio",
  "whatsapp_recebido",
  "whatsapp_enviado",
  "email",
  "ligacao",
  "sistema",
] as const;
export type TipoHistorico = (typeof TIPOS_HISTORICO)[number];

export const leads = sqliteTable("leads", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  nomeContato: text("nome_contato").notNull(),
  telefone: text("telefone"),
  email: text("email"),
  segmento: text("segmento"),
  canalOrigem: text("canal_origem"),
  valorNegociacao: real("valor_negociacao"),
  estagio: text("estagio").$type<Estagio>().notNull().default("a_prospectar"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const historico = sqliteTable("historico", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  leadId: text("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  tipo: text("tipo").$type<TipoHistorico>().notNull().default("nota"),
  conteudo: text("conteudo").notNull(),
  autor: text("autor"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const lembretes = sqliteTable("lembretes", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  leadId: text("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  titulo: text("titulo").notNull(),
  descricao: text("descricao"),
  dataHora: integer("data_hora", { mode: "timestamp" }).notNull(),
  canalAlerta: text("canal_alerta").$type<CanalAlerta>().notNull().default("ambos"),
  status: text("status").$type<StatusLembrete>().notNull().default("pendente"),
  enviadoEm: integer("enviado_em", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  nome: text("nome").notNull(),
  senhaHash: text("senha_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
