"use client";

import { useDraggable } from "@dnd-kit/core";
import { AlarmClock, Phone, Tag } from "lucide-react";
import { formatarMoeda, formatarDataHora } from "@/lib/format";
import type { LeadComRelacoes } from "@/lib/types";

export function LeadCard({
  lead,
  onAbrir,
}: {
  lead: LeadComRelacoes;
  onAbrir: (lead: LeadComRelacoes) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
  });

  const lembreteVencido =
    lead.proximoLembrete && new Date(lead.proximoLembrete.dataHora).getTime() <= Date.now();

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onAbrir(lead)}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : undefined
      }
      className={`cursor-pointer rounded-lg border border-zinc-200 bg-white p-3 shadow-sm transition hover:shadow-md ${
        isDragging ? "z-50 opacity-70 shadow-lg" : ""
      }`}
    >
      <p className="text-sm font-semibold text-zinc-900">{lead.nomeContato}</p>
      {lead.telefone && (
        <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
          <Phone size={12} /> {lead.telefone}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-1">
        {lead.segmento && (
          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600">
            <Tag size={10} /> {lead.segmento}
          </span>
        )}
        {lead.canalOrigem && (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-600">
            {lead.canalOrigem}
          </span>
        )}
      </div>
      {lead.valorNegociacao != null && (
        <p className="mt-2 text-sm font-medium text-emerald-700">
          {formatarMoeda(lead.valorNegociacao)}
        </p>
      )}
      {lead.proximoLembrete && (
        <p
          className={`mt-2 flex items-center gap-1 text-[11px] ${
            lembreteVencido ? "text-red-600" : "text-amber-600"
          }`}
        >
          <AlarmClock size={12} /> {formatarDataHora(lead.proximoLembrete.dataHora)} - {lead.proximoLembrete.titulo}
        </p>
      )}
    </div>
  );
}
