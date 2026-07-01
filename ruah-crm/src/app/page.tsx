import { getServerSession } from "next-auth";
import { KanbanBoardClient } from "@/components/KanbanBoardClient";
import { authOptions } from "@/lib/auth";
import { listarLeadsComRelacoes } from "@/lib/leads";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [leads, session] = await Promise.all([
    listarLeadsComRelacoes(),
    getServerSession(authOptions),
  ]);
  return <KanbanBoardClient leadsIniciais={leads} usuarioNome={session?.user?.name ?? null} />;
}
