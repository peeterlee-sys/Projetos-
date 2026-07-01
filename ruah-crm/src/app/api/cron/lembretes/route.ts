import { NextRequest, NextResponse } from "next/server";
import { processarLembretesPendentes } from "@/lib/reminders";

function autorizado(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // sem CRON_SECRET configurado, endpoint fica aberto (uso local/dev)

  const header = request.headers.get("authorization");
  const query = request.nextUrl.searchParams.get("secret");
  return header === `Bearer ${secret}` || query === secret;
}

export async function GET(request: NextRequest) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }
  const processados = await processarLembretesPendentes();
  return NextResponse.json({ processados: processados.length, detalhes: processados });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
