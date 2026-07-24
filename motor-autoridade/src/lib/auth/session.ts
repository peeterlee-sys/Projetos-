import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AppUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: "super_admin" | "admin" | "client" | "collaborator";
  tenant_id: string | null;
  onboarded_at: string | null;
};

/**
 * Retorna o usuário autenticado + perfil (public.users), ou null.
 *
 * Perf: usa `getSession()` (lê o cookie, sem ida à rede) em vez de `getUser()`
 * (que revalida no servidor de auth). A middleware já valida a sessão com
 * `getUser` a cada requisição, e a consulta ao perfil é protegida por RLS
 * (id = auth.uid()) — então ler o id da sessão aqui é seguro e bem mais rápido.
 */
export async function getSessionUser(): Promise<AppUser | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("id, email, full_name, role, tenant_id, onboarded_at")
    .eq("id", userId)
    .maybeSingle();

  return (profile as AppUser) ?? null;
}

/** Igual ao anterior, mas redireciona para /login se não houver sessão. */
export async function requireUser(): Promise<AppUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}
