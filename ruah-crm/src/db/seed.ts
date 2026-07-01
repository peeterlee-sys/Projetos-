import "dotenv/config";
import { db } from "./client";
import { leads, historico, lembretes } from "./schema";

async function main() {
  const [lead1] = await db
    .insert(leads)
    .values({
      nomeContato: "Marcos Ferreira - Rede Varejo Sul",
      telefone: "+5511988887777",
      email: "marcos@redevarejosul.com.br",
      segmento: "Varejo",
      canalOrigem: "Indicacao",
      valorNegociacao: 18000,
      estagio: "interesse_confirmado",
    })
    .returning();

  const [lead2] = await db
    .insert(leads)
    .values({
      nomeContato: "Ana Paula - Construtora Horizonte",
      telefone: "+5511977776666",
      email: "ana.paula@horizonte.com.br",
      segmento: "Construcao Civil",
      canalOrigem: "WhatsApp",
      valorNegociacao: 42000,
      estagio: "proposta_enviada",
    })
    .returning();

  await db.insert(leads).values({
    nomeContato: "Rafael Souza - Studio Fit",
    telefone: "+5511966665555",
    email: "rafael@studiofit.com",
    segmento: "Academias",
    canalOrigem: "Instagram Ads",
    valorNegociacao: 6500,
    estagio: "a_prospectar",
  });

  await db.insert(historico).values([
    {
      leadId: lead1.id,
      tipo: "sistema",
      conteudo: "Lead criado manualmente no pipeline.",
    },
    {
      leadId: lead1.id,
      tipo: "ligacao",
      conteudo: "Primeira ligacao: interesse confirmado em painel DOOH no shopping.",
      autor: "Equipe Comercial",
    },
    {
      leadId: lead2.id,
      tipo: "whatsapp_recebido",
      conteudo: "Cliente pediu proposta para 3 pontos de OOH na regiao central.",
    },
  ]);

  await db.insert(lembretes).values([
    {
      leadId: lead1.id,
      titulo: "Reuniao de apresentacao de proposta",
      descricao: "Levar portfolio de pontos DOOH no shopping.",
      dataHora: new Date("2026-07-09T16:00:00-03:00"),
      canalAlerta: "ambos",
    },
    {
      leadId: lead2.id,
      titulo: "Follow-up da proposta enviada",
      dataHora: new Date("2026-07-03T10:00:00-03:00"),
      canalAlerta: "whatsapp",
    },
  ]);

  console.log("Seed concluido.");
}

main()
  .catch((err) => {
    console.error("Falha ao popular banco:", err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
