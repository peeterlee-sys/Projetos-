import { z } from "zod";
import { CANAIS_ALERTA, ESTAGIOS } from "@/db/schema";

export const criarLeadSchema = z.object({
  nomeContato: z.string().trim().min(1, "Nome do contato e obrigatorio"),
  telefone: z.string().trim().optional().nullable(),
  email: z.string().trim().email().optional().nullable().or(z.literal("")),
  segmento: z.string().trim().optional().nullable(),
  canalOrigem: z.string().trim().optional().nullable(),
  valorNegociacao: z.coerce.number().nonnegative().optional().nullable(),
  estagio: z.enum(ESTAGIOS).optional(),
});

export const atualizarLeadSchema = criarLeadSchema.partial();

export const criarHistoricoSchema = z.object({
  tipo: z
    .enum(["nota", "mudanca_estagio", "whatsapp_recebido", "whatsapp_enviado", "email", "ligacao", "sistema"])
    .default("nota"),
  conteudo: z.string().trim().min(1, "Conteudo e obrigatorio"),
  autor: z.string().trim().optional().nullable(),
});

export const criarLembreteSchema = z.object({
  titulo: z.string().trim().min(1, "Titulo e obrigatorio"),
  descricao: z.string().trim().optional().nullable(),
  dataHora: z.coerce.date(),
  canalAlerta: z.enum(CANAIS_ALERTA).default("ambos"),
});

export const atualizarLembreteSchema = z.object({
  titulo: z.string().trim().min(1).optional(),
  descricao: z.string().trim().optional().nullable(),
  dataHora: z.coerce.date().optional(),
  canalAlerta: z.enum(CANAIS_ALERTA).optional(),
  status: z.enum(["pendente", "enviado", "cancelado", "erro"]).optional(),
});
