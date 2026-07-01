"use client";

import dynamic from "next/dynamic";

// dnd-kit gera ids internos (aria-describedby) que nao coincidem entre a
// renderizacao no servidor e a hidratacao no cliente quando ha mais de um
// card na tela; carregando o board somente no cliente evitamos o mismatch.
export const KanbanBoardClient = dynamic(
  () => import("./KanbanBoard").then((mod) => mod.KanbanBoard),
  {
    ssr: false,
    loading: () => <div className="p-6 text-sm text-zinc-500">Carregando pipeline...</div>,
  },
);
