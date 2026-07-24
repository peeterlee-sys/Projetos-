import { BottomNav } from "@/components/nav/BottomNav";

/**
 * Shell autenticado. O middleware já protege as rotas (valida a sessão a cada
 * requisição) e cada página chama `requireUser`, então NÃO repetimos aqui o
 * `getUser` — isso evita uma ida extra ao servidor de auth por navegação.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-md pb-24">
      {children}
      <BottomNav />
    </div>
  );
}
