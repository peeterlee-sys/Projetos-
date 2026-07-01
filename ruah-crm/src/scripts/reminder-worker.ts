import "dotenv/config";
import cron from "node-cron";
import { processarLembretesPendentes } from "../lib/reminders";

const EXPRESSAO_CRON = process.env.REMINDER_CRON_EXPRESSION || "* * * * *"; // a cada minuto

console.log(`[reminder-worker] Iniciando worker de lembretes (${EXPRESSAO_CRON}).`);

async function ciclo() {
  try {
    const processados = await processarLembretesPendentes();
    if (processados.length > 0) {
      console.log(`[reminder-worker] ${processados.length} lembrete(s) processado(s).`);
    }
  } catch (err) {
    console.error("[reminder-worker] Erro ao processar lembretes:", err);
  }
}

cron.schedule(EXPRESSAO_CRON, ciclo);
ciclo();
