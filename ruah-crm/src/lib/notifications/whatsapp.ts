const WHATSAPP_API_VERSION = "v21.0";

function destinatariosConfigurados(): string[] {
  return (process.env.WHATSAPP_ALERT_RECIPIENTS || "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
}

/**
 * Envia uma mensagem de texto via WhatsApp Cloud API (Meta).
 * Requer WHATSAPP_API_TOKEN e WHATSAPP_PHONE_NUMBER_ID configurados.
 */
export async function enviarWhatsApp(mensagem: string, destinatarios?: string[]) {
  const token = process.env.WHATSAPP_API_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const alvos = destinatarios?.length ? destinatarios : destinatariosConfigurados();

  if (!token || !phoneNumberId) {
    console.warn(
      "[whatsapp] WHATSAPP_API_TOKEN/WHATSAPP_PHONE_NUMBER_ID nao configurados; alerta nao enviado:",
      mensagem,
    );
    return { ok: false, motivo: "credenciais_ausentes" as const };
  }

  if (!alvos.length) {
    console.warn("[whatsapp] Nenhum destinatario configurado (WHATSAPP_ALERT_RECIPIENTS); alerta nao enviado.");
    return { ok: false, motivo: "sem_destinatarios" as const };
  }

  const resultados = await Promise.all(
    alvos.map(async (numero) => {
      const resposta = await fetch(
        `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: numero.replace(/\D/g, ""),
            type: "text",
            text: { body: mensagem },
          }),
        },
      );

      if (!resposta.ok) {
        const erro = await resposta.text();
        console.error(`[whatsapp] Falha ao enviar para ${numero}:`, erro);
        return { numero, ok: false };
      }
      return { numero, ok: true };
    }),
  );

  return { ok: resultados.every((r) => r.ok), resultados };
}
