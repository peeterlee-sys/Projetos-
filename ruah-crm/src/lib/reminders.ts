import { and, eq, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { leads, lembretes } from "@/db/schema";
import { registrarHistorico } from "@/lib/leads";
import { formatarDataHora } from "@/lib/format";
import { dispararAlerta } from "@/lib/notifications";

/**
 * Busca lembretes pendentes cuja data/hora ja chegou e dispara o alerta
 * configurado (WhatsApp, e-mail ou ambos). Deve ser chamado periodicamente
 * por um cron externo (ver /api/cron/lembretes) ou pelo worker standalone.
 */
export async function processarLembretesPendentes(agora: Date = new Date()) {
  const pendentes = await db
    .select({ lembrete: lembretes, lead: leads })
    .from(lembretes)
    .innerJoin(leads, eq(lembretes.leadId, leads.id))
    .where(and(eq(lembretes.status, "pendente"), lte(lembretes.dataHora, agora)));

  const processados = [];

  for (const { lembrete, lead } of pendentes) {
    const assunto = `Lembrete Ruah CRM: ${lembrete.titulo}`;
    const mensagem = [
      `Lembrete: ${lembrete.titulo}`,
      `Lead: ${lead.nomeContato}`,
      `Quando: ${formatarDataHora(lembrete.dataHora)}`,
      lembrete.descricao ? `Detalhes: ${lembrete.descricao}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const enviado = await dispararAlerta(lembrete.canalAlerta, assunto, mensagem);

    await db
      .update(lembretes)
      .set({
        status: enviado ? "enviado" : "erro",
        enviadoEm: enviado ? new Date() : null,
      })
      .where(eq(lembretes.id, lembrete.id));

    await registrarHistorico(
      lead.id,
      "sistema",
      enviado
        ? `Alerta de lembrete "${lembrete.titulo}" enviado via ${lembrete.canalAlerta}.`
        : `Falha ao enviar alerta do lembrete "${lembrete.titulo}" via ${lembrete.canalAlerta}.`,
    );

    processados.push({ id: lembrete.id, enviado });
  }

  return processados;
}
