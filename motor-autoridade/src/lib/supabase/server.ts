import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createRawClient } from "@supabase/supabase-js";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Cliente Supabase para Server Components, Route Handlers e Server Actions.
 * Usa a anon key + cookies do usuário — todas as queries respeitam a RLS.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Chamado de um Server Component: ignorar (o middleware renova a sessão).
          }
        },
      },
    }
  );
}

/**
 * Cliente com service role — SOMENTE no servidor, ignora RLS.
 * Usar apenas em operações confiáveis (webhooks Make, jobs, geração de IA).
 * Nunca importar em componentes client.
 */
export function createServiceClient() {
  return createRawClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
