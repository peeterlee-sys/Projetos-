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

/** Retorna o usuário autenticado + perfil (public.users), ou null. */
export async function getSessionUser(): Promise<AppUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("id, email, full_name, role, tenant_id, onboarded_at")
    .eq("id", user.id)
    .maybeSingle();

  return (profile as AppUser) ?? null;
}

/** Igual ao anterior, mas redireciona para /login se não houver sessão. */
export async function requireUser(): Promise<AppUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}
