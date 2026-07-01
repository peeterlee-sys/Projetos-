import type { CanalAlerta } from "@/db/schema";
import { enviarEmail } from "./email";
import { enviarWhatsApp } from "./whatsapp";

export async function dispararAlerta(canal: CanalAlerta, assunto: string, mensagem: string) {
  const tarefas: Promise<{ ok: boolean }>[] = [];
  if (canal === "whatsapp" || canal === "ambos") {
    tarefas.push(enviarWhatsApp(mensagem));
  }
  if (canal === "email" || canal === "ambos") {
    tarefas.push(enviarEmail(assunto, mensagem));
  }
  const resultados = await Promise.allSettled(tarefas);
  return resultados.every((r) => r.status === "fulfilled" && r.value.ok);
}

export { enviarEmail, enviarWhatsApp };
