import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { historico, leads, lembretes, type TipoHistorico } from "@/db/schema";

export async function listarLeadsComRelacoes() {
  const todosLeads = await db.select().from(leads).orderBy(desc(leads.updatedAt));
  const todosHistoricos = await db.select().from(historico).orderBy(desc(historico.createdAt));
  const todosLembretes = await db
    .select()
    .from(lembretes)
    .where(eq(lembretes.status, "pendente"))
    .orderBy(lembretes.dataHora);

  return todosLeads.map((lead) => ({
    ...lead,
    historico: todosHistoricos.filter((h) => h.leadId === lead.id),
    proximoLembrete:
      todosLembretes.find((l) => l.leadId === lead.id) ?? null,
  }));
}

export async function buscarLeadComRelacoes(leadId: string) {
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
  if (!lead) return null;

  const historicoDoLead = await db
    .select()
    .from(historico)
    .where(eq(historico.leadId, leadId))
    .orderBy(desc(historico.createdAt));

  const lembretesDoLead = await db
    .select()
    .from(lembretes)
    .where(eq(lembretes.leadId, leadId))
    .orderBy(lembretes.dataHora);

  return { ...lead, historico: historicoDoLead, lembretes: lembretesDoLead };
}

export async function registrarHistorico(
  leadId: string,
  tipo: TipoHistorico,
  conteudo: string,
  autor?: string | null,
) {
  const [registro] = await db
    .insert(historico)
    .values({ leadId, tipo, conteudo, autor })
    .returning();
  return registro;
}

export async function buscarLeadPorTelefone(telefone: string) {
  const [lead] = await db.select().from(leads).where(eq(leads.telefone, telefone));
  return lead ?? null;
}

export function normalizarTelefone(valor: string) {
  const digitos = valor.replace(/\D/g, "");
  return `+${digitos}`;
}
