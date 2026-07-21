import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Encerra a sessão e volta ao login. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
