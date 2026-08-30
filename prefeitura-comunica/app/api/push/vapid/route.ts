import { NextResponse } from "next/server";

/** Devolve a chave pública VAPID pro navegador se inscrever no push. */
export async function GET() {
  const key = process.env.VAPID_PUBLIC_KEY ?? "";
  return NextResponse.json({ key, enabled: !!key });
}
