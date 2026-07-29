import { BottomNav } from "@/components/nav/BottomNav";
import { SideNav } from "@/components/nav/SideNav";
import { brand } from "@/lib/brand";

/**
 * Shell autenticado. O middleware já protege as rotas (valida a sessão a cada
 * requisição) e cada página chama `requireUser`, então NÃO repetimos aqui o
 * `getUser` — isso evita uma ida extra ao servidor de auth por navegação.
 *
 * O Take é um PWA de celular e continua numa coluna estreita. No Assessor 24h
 * quem mais abre o painel é o assessor, no computador, para revisar e publicar
 * o que o vereador gerou no WhatsApp — daí a navegação lateral e a largura
 * livre (cada página define o próprio limite).
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  if (brand.id !== "assessor24h") {
    return (
      <div className="mx-auto min-h-dvh max-w-md pb-24">
        {children}
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-dvh md:flex">
      <SideNav />
      <div className="min-w-0 flex-1 pb-24 md:pb-0">{children}</div>
      <BottomNav />
    </div>
  );
}
