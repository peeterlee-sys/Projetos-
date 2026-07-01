"use client";

import { useState } from "react";
import { DndContext, useDroppable, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { ESTAGIO_LABELS, ESTAGIOS, type Estagio } from "@/db/schema";
import type { Lead, LeadComDetalhes, LeadComRelacoes } from "@/lib/types";
import { LeadCard } from "./LeadCard";
import { LeadDetailDrawer } from "./LeadDetailDrawer";
import { NovoLeadModal } from "./NovoLeadModal";
import { RuahLogo } from "./RuahLogo";

function Coluna({
  estagio,
  leads,
  onAbrirLead,
}: {
  estagio: Estagio;
  leads: LeadComRelacoes[];
  onAbrirLead: (lead: LeadComRelacoes) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: estagio });
  const valorTotal = leads.reduce((soma, l) => soma + (l.valorNegociacao ?? 0), 0);

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[70vh] w-72 flex-shrink-0 flex-col rounded-xl border ${
        isOver ? "border-blue-400 bg-blue-50/60" : "border-zinc-200 bg-zinc-100/60"
      } p-3`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-700">{ESTAGIO_LABELS[estagio]}</h2>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-zinc-500 shadow-sm">
          {leads.length}
        </span>
      </div>
      {valorTotal > 0 && (
        <p className="mb-2 text-xs text-zinc-500">
          {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valorTotal)}
        </p>
      )}
      <div className="flex flex-1 flex-col gap-2">
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} onAbrir={onAbrirLead} />
        ))}
      </div>
    </div>
  );
}

export function KanbanBoard({ leadsIniciais }: { leadsIniciais: LeadComRelacoes[] }) {
  const [leads, setLeads] = useState(leadsIniciais);
  const [leadSelecionado, setLeadSelecionado] = useState<LeadComRelacoes | null>(null);
  const [modalNovoLeadAberto, setModalNovoLeadAberto] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  async function moverLead(leadId: string, novoEstagio: Estagio) {
    setLeads((atual) =>
      atual.map((l) => (l.id === leadId ? { ...l, estagio: novoEstagio } : l)),
    );
    await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estagio: novoEstagio }),
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const novoEstagio = over.id as Estagio;
    const lead = leads.find((l) => l.id === active.id);
    if (lead && lead.estagio !== novoEstagio) {
      moverLead(lead.id, novoEstagio);
    }
  }

  function handleLeadCriado(lead: Lead) {
    setLeads((atual) => [{ ...lead, historico: [], proximoLembrete: null }, ...atual]);
    setModalNovoLeadAberto(false);
  }

  function handleLeadAtualizado(lead: LeadComDetalhes) {
    const proximoLembrete =
      lead.lembretes
        .filter((l) => l.status === "pendente")
        .sort((a, b) => new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime())[0] ?? null;
    const atualizado: LeadComRelacoes = { ...lead, proximoLembrete };
    setLeads((atual) => atual.map((l) => (l.id === lead.id ? atualizado : l)));
    setLeadSelecionado(atualizado);
  }

  function handleLeadExcluido(leadId: string) {
    setLeads((atual) => atual.filter((l) => l.id !== leadId));
    setLeadSelecionado(null);
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <RuahLogo />
          <div className="border-l border-zinc-300 pl-3">
            <p className="text-sm font-semibold text-zinc-700">Pipeline de Vendas</p>
            <p className="text-xs text-zinc-400">OOH / DOOH - acompanhamento de oportunidades</p>
          </div>
        </div>
        <button
          onClick={() => setModalNovoLeadAberto(true)}
          className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          <Plus size={16} /> Novo lead
        </button>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {ESTAGIOS.map((estagio) => (
            <Coluna
              key={estagio}
              estagio={estagio}
              leads={leads.filter((l) => l.estagio === estagio)}
              onAbrirLead={setLeadSelecionado}
            />
          ))}
        </div>
      </DndContext>

      {leadSelecionado && (
        <LeadDetailDrawer
          leadId={leadSelecionado.id}
          onFechar={() => setLeadSelecionado(null)}
          onAtualizado={handleLeadAtualizado}
          onExcluido={handleLeadExcluido}
        />
      )}

      {modalNovoLeadAberto && (
        <NovoLeadModal onFechar={() => setModalNovoLeadAberto(false)} onCriado={handleLeadCriado} />
      )}
    </div>
  );
}
