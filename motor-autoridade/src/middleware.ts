import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Tudo, exceto ativos estáticos, o SW e a API (a API valida sessão por conta própria).
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js|api).*)",
  ],
};
