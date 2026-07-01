import type { CanalAlerta, Estagio, StatusLembrete, TipoHistorico } from "@/db/schema";

export interface Lead {
  id: string;
  nomeContato: string;
  telefone: string | null;
  email: string | null;
  segmento: string | null;
  canalOrigem: string | null;
  valorNegociacao: number | null;
  estagio: Estagio;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface HistoricoItem {
  id: string;
  leadId: string;
  tipo: TipoHistorico;
  conteudo: string;
  autor: string | null;
  createdAt: string | Date;
}

export interface Lembrete {
  id: string;
  leadId: string;
  titulo: string;
  descricao: string | null;
  dataHora: string | Date;
  canalAlerta: CanalAlerta;
  status: StatusLembrete;
  enviadoEm: string | Date | null;
  createdAt: string | Date;
}

export interface LeadComRelacoes extends Lead {
  historico: HistoricoItem[];
  proximoLembrete: Lembrete | null;
}

export interface LeadComDetalhes extends Lead {
  historico: HistoricoItem[];
  lembretes: Lembrete[];
}
