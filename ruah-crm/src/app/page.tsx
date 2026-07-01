import { KanbanBoardClient } from "@/components/KanbanBoardClient";
import { listarLeadsComRelacoes } from "@/lib/leads";

export const dynamic = "force-dynamic";

export default async function Home() {
  const leads = await listarLeadsComRelacoes();
  return <KanbanBoardClient leadsIniciais={leads} />;
}
