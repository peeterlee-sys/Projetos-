import { db } from "@/db/client";
import { ESTAGIO_LABELS, leads } from "@/db/schema";
import { buscarLeadPorTelefone, normalizarTelefone, registrarHistorico } from "@/lib/leads";
import { enviarWhatsApp } from "@/lib/notifications/whatsapp";
import { extrairLeadDeMensagem, pareceNovoLead } from "@/lib/whatsapp-parser";
import { formatarMoeda } from "@/lib/format";
import { eq } from "drizzle-orm";

export interface MensagemWhatsappRecebida {
  de: string; // numero do remetente (wa_id), so digitos
  nomePerfil?: string;
  texto: string;
}

/**
 * Processa uma mensagem inbound do WhatsApp: cria um novo lead no pipeline
 * quando reconhece dados suficientes, atualiza um lead existente (pelo
 * telefone) caso ja exista, e sempre registra a mensagem no historico.
 * Retorna o lead afetado para fins de log/confirmacao.
 */
export async function processarMensagemWhatsapp({ de, nomePerfil, texto }: MensagemWhatsappRecebida) {
  const telefone = normalizarTelefone(de);
  const extraido = extrairLeadDeMensagem(texto);
  const leadExistente = await buscarLeadPorTelefone(telefone);

  if (!leadExistente) {
    const novoLead = pareceNovoLead(texto, extraido);
    const [lead] = await db
      .insert(leads)
      .values({
        nomeContato: extraido.nome || nomePerfil || telefone,
        telefone,
        segmento: extraido.segmento ?? null,
        canalOrigem: extraido.canalOrigem || "WhatsApp",
        valorNegociacao: extraido.valor ?? null,
        estagio: extraido.valor ? "interesse_confirmado" : "a_prospectar",
      })
      .returning();

    await registrarHistorico(
      lead.id,
      "sistema",
      novoLead
        ? "Lead criado automaticamente a partir de mensagem no WhatsApp."
        : "Lead criado automaticamente (primeira mensagem recebida no WhatsApp).",
    );
    await registrarHistorico(lead.id, "whatsapp_recebido", texto, nomePerfil);

    await confirmarNoWhatsapp(de, lead);
    return lead;
  }

  const atualizacoes: Partial<typeof leads.$inferInsert> = { updatedAt: new Date() };
  if (extraido.nome && extraido.nome !== leadExistente.nomeContato) atualizacoes.nomeContato = extraido.nome;
  if (extraido.segmento) atualizacoes.segmento = extraido.segmento;
  if (extraido.canalOrigem) atualizacoes.canalOrigem = extraido.canalOrigem;
  if (extraido.valor !== undefined) atualizacoes.valorNegociacao = extraido.valor;

  const [leadAtualizado] = await db
    .update(leads)
    .set(atualizacoes)
    .where(eq(leads.id, leadExistente.id))
    .returning();

  await registrarHistorico(leadExistente.id, "whatsapp_recebido", texto, nomePerfil);
  if (extraido.valor !== undefined && extraido.valor !== leadExistente.valorNegociacao) {
    await registrarHistorico(
      leadExistente.id,
      "sistema",
      `Valor em negociacao atualizado para ${formatarMoeda(extraido.valor)} via WhatsApp.`,
    );
  }

  await confirmarNoWhatsapp(de, leadAtualizado);
  return leadAtualizado;
}

async function confirmarNoWhatsapp(remetente: string, lead: typeof leads.$inferSelect) {
  const mensagem = [
    `Registrado no pipeline Ruah:`,
    `Lead: ${lead.nomeContato}`,
    lead.segmento ? `Segmento: ${lead.segmento}` : null,
    lead.valorNegociacao ? `Valor: ${formatarMoeda(lead.valorNegociacao)}` : null,
    `Estagio: ${ESTAGIO_LABELS[lead.estagio]}`,
  ]
    .filter(Boolean)
    .join("\n");

  await enviarWhatsApp(mensagem, [remetente]);
}
