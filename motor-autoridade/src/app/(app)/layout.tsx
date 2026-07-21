import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "@/components/nav/BottomNav";

/**
 * Shell autenticado. O middleware já protege as rotas e força o onboarding;
 * aqui garantimos o usuário no servidor como defesa em profundidade.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto min-h-dvh max-w-md pb-24">
      {children}
      <BottomNav />
    </div>
  );
}
