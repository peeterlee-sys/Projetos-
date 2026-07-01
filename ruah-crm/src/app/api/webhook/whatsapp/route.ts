import { NextRequest, NextResponse } from "next/server";
import { processarMensagemWhatsapp } from "@/lib/whatsapp-inbound";

// Handshake de verificacao exigido pela WhatsApp Cloud API (Meta) ao
// configurar o webhook. Veja:
// https://developers.facebook.com/docs/graph-api/webhooks/getting-started
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const modo = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (modo === "subscribe" && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Token de verificacao invalido" }, { status: 403 });
}

interface PayloadWhatsapp {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
        messages?: Array<{
          from: string;
          type: string;
          text?: { body?: string };
        }>;
      };
    }>;
  }>;
}

export async function POST(request: NextRequest) {
  const payload: PayloadWhatsapp = await request.json();

  const processamentos: Promise<unknown>[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const valor = change.value;
      if (!valor?.messages?.length) continue;

      for (const mensagem of valor.messages) {
        if (mensagem.type !== "text" || !mensagem.text?.body) continue;

        const contato = valor.contacts?.find((c) => c.wa_id === mensagem.from);
        processamentos.push(
          processarMensagemWhatsapp({
            de: mensagem.from,
            nomePerfil: contato?.profile?.name,
            texto: mensagem.text.body,
          }),
        );
      }
    }
  }

  await Promise.allSettled(processamentos);

  // A Meta exige resposta 200 rapida para nao reenviar o webhook.
  return NextResponse.json({ ok: true });
}
