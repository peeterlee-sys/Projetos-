import nodemailer from "nodemailer";

function destinatariosConfigurados(): string[] {
  return (process.env.EMAIL_ALERT_RECIPIENTS || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

function criarTransportador() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

export async function enviarEmail(assunto: string, mensagem: string, destinatarios?: string[]) {
  const transportador = criarTransportador();
  const alvos = destinatarios?.length ? destinatarios : destinatariosConfigurados();

  if (!transportador) {
    console.warn("[email] SMTP nao configurado; alerta nao enviado:", assunto);
    return { ok: false, motivo: "credenciais_ausentes" as const };
  }

  if (!alvos.length) {
    console.warn("[email] Nenhum destinatario configurado (EMAIL_ALERT_RECIPIENTS); alerta nao enviado.");
    return { ok: false, motivo: "sem_destinatarios" as const };
  }

  try {
    await transportador.sendMail({
      from: process.env.SMTP_FROM || "Ruah CRM <crm@ruah.com.br>",
      to: alvos.join(","),
      subject: assunto,
      text: mensagem,
    });
    return { ok: true };
  } catch (err) {
    console.error("[email] Falha ao enviar:", err);
    return { ok: false, motivo: "erro_envio" as const };
  }
}
