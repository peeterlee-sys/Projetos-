import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Encerra a sessão e volta ao login. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const res = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  // Limpa o cache do gate de onboarding (senão o próximo usuário no mesmo
  // navegador poderia pular a verificação).
  res.cookies.set("mo_onb", "", { maxAge: 0, path: "/" });
  return res;
}
