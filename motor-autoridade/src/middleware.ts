import { type NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  try {
    return await updateSession(request);
  } catch (error) {
    console.error("Middleware error:", error);
    // Retorna erro 500 em vez de crash silencioso
    return NextResponse.json({ error: "Middleware error" }, { status: 500 });
  }
}

export const config = {
  matcher: [
    // Tudo, exceto ativos estáticos, o SW e a API (a API valida sessão por conta própria).
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js|api).*)",
  ],
};
