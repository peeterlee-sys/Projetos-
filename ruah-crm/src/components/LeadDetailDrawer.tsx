"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AlarmClock, Trash2, X } from "lucide-react";
import { ESTAGIO_LABELS, ESTAGIOS } from "@/db/schema";
import { formatarDataHora, formatarMoeda } from "@/lib/format";
import type { LeadComDetalhes } from "@/lib/types";

const TIPO_HISTORICO_LABELS: Record<string, string> = {
  nota: "Nota",
  mudanca_estagio: "Mudanca de estagio",
  whatsapp_recebido: "WhatsApp (recebido)",
  whatsapp_enviado: "WhatsApp (enviado)",
  email: "E-mail",
  ligacao: "Ligacao",
  sistema: "Sistema",
};

export function LeadDetailDrawer({
  leadId,
  onFechar,
  onAtualizado,
  onExcluido,
}: {
  leadId: string;
  onFechar: () => void;
  onAtualizado: (lead: LeadComDetalhes) => void;
  onExcluido: (leadId: string) => void;
}) {
  const [lead, setLead] = useState<LeadComDetalhes | null>(null);
  const [novaNota, setNovaNota] = useState("");
  const [salvandoNota, setSalvandoNota] = useState(false);
  const [novoLembrete, setNovoLembrete] = useState({ titulo: "", dataHora: "", canalAlerta: "ambos" });
  const [salvandoLembrete, setSalvandoLembrete] = useState(false);

  async function carregar() {
    const resposta = await fetch(`/api/leads/${leadId}`);
    if (resposta.ok) setLead(await resposta.json());
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  async function atualizarCampo(campo: string, valor: string | number | null) {
    const resposta = await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [campo]: valor }),
    });
    if (resposta.ok) {
      await carregar();
    }
  }

  async function adicionarNota(event: FormEvent) {
    event.preventDefault();
    if (!novaNota.trim()) return;
    setSalvandoNota(true);
    await fetch(`/api/leads/${leadId}/historico`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "nota", conteudo: novaNota }),
    });
    setNovaNota("");
    setSalvandoNota(false);
    await carregar();
  }

  async function adicionarLembrete(event: FormEvent) {
    event.preventDefault();
    if (!novoLembrete.titulo.trim() || !novoLembrete.dataHora) return;
    setSalvandoLembrete(true);
    await fetch(`/api/leads/${leadId}/lembretes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titulo: novoLembrete.titulo,
        dataHora: new Date(novoLembrete.dataHora).toISOString(),
        canalAlerta: novoLembrete.canalAlerta,
      }),
    });
    setNovoLembrete({ titulo: "", dataHora: "", canalAlerta: "ambos" });
    setSalvandoLembrete(false);
    await carregar();
  }

  async function excluirLead() {
    if (!confirm("Excluir este lead definitivamente?")) return;
    await fetch(`/api/leads/${leadId}`, { method: "DELETE" });
    onExcluido(leadId);
  }

  useEffect(() => {
    if (lead) onAtualizado(lead);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <div className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">Detalhes do lead</h2>
          <div className="flex items-center gap-3">
            <button onClick={excluirLead} className="text-zinc-400 hover:text-red-600" title="Excluir lead">
              <Trash2 size={18} />
            </button>
            <button onClick={onFechar} className="text-zinc-400 hover:text-zinc-700">
              <X size={20} />
            </button>
          </div>
        </div>

        {!lead && <p className="text-sm text-zinc-500">Carregando...</p>}

        {lead && (
          <>
            <section className="mb-5 flex flex-col gap-3 rounded-lg border border-zinc-200 p-3">
              <CampoEditavel label="Nome do contato" valor={lead.nomeContato} onSalvar={(v) => atualizarCampo("nomeContato", v)} />
              <CampoEditavel label="Telefone" valor={lead.telefone ?? ""} onSalvar={(v) => atualizarCampo("telefone", v)} />
              <CampoEditavel label="E-mail" valor={lead.email ?? ""} onSalvar={(v) => atualizarCampo("email", v)} />
              <CampoEditavel label="Segmento" valor={lead.segmento ?? ""} onSalvar={(v) => atualizarCampo("segmento", v)} />
              <CampoEditavel label="Canal de origem" valor={lead.canalOrigem ?? ""} onSalvar={(v) => atualizarCampo("canalOrigem", v)} />
              <CampoEditavel
                label="Valor em negociacao"
                valor={lead.valorNegociacao?.toString() ?? ""}
                onSalvar={(v) => atualizarCampo("valorNegociacao", v ? Number(v) : null)}
              />
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-zinc-700">Estagio</span>
                <select
                  value={lead.estagio}
                  onChange={(e) => atualizarCampo("estagio", e.target.value)}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                >
                  {ESTAGIOS.map((estagio) => (
                    <option key={estagio} value={estagio}>
                      {ESTAGIO_LABELS[estagio]}
                    </option>
                  ))}
                </select>
              </label>
              {lead.valorNegociacao != null && (
                <p className="text-sm text-emerald-700">{formatarMoeda(lead.valorNegociacao)}</p>
              )}
            </section>

            <section className="mb-5">
              <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold text-zinc-800">
                <AlarmClock size={16} /> Lembretes
              </h3>
              <div className="mb-3 flex flex-col gap-2">
                {lead.lembretes.length === 0 && <p className="text-xs text-zinc-400">Nenhum lembrete cadastrado.</p>}
                {lead.lembretes.map((l) => (
                  <div key={l.id} className="flex items-center justify-between rounded-lg border border-zinc-200 p-2 text-sm">
                    <div>
                      <p className="font-medium text-zinc-800">{l.titulo}</p>
                      <p className="text-xs text-zinc-500">
                        {formatarDataHora(l.dataHora)} - {l.canalAlerta} - {l.status}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <form onSubmit={adicionarLembrete} className="flex flex-col gap-2 rounded-lg bg-zinc-50 p-3">
                <input
                  placeholder="Ex: Reuniao de apresentacao de proposta"
                  value={novoLembrete.titulo}
                  onChange={(e) => setNovoLembrete((s) => ({ ...s, titulo: e.target.value }))}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <input
                    type="datetime-local"
                    value={novoLembrete.dataHora}
                    onChange={(e) => setNovoLembrete((s) => ({ ...s, dataHora: e.target.value }))}
                    className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                  />
                  <select
                    value={novoLembrete.canalAlerta}
                    onChange={(e) => setNovoLembrete((s) => ({ ...s, canalAlerta: e.target.value }))}
                    className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                  >
                    <option value="ambos">WhatsApp + E-mail</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="email">E-mail</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={salvandoLembrete}
                  className="self-end rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                >
                  Adicionar lembrete
                </button>
              </form>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold text-zinc-800">Historico</h3>
              <form onSubmit={adicionarNota} className="mb-3 flex gap-2">
                <input
                  placeholder="Adicionar nota..."
                  value={novaNota}
                  onChange={(e) => setNovaNota(e.target.value)}
                  className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={salvandoNota}
                  className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                >
                  Salvar
                </button>
              </form>
              <ul className="flex flex-col gap-2">
                {lead.historico.map((item) => (
                  <li key={item.id} className="rounded-lg border border-zinc-200 p-2 text-sm">
                    <div className="mb-1 flex items-center justify-between text-xs text-zinc-400">
                      <span>{TIPO_HISTORICO_LABELS[item.tipo] ?? item.tipo}</span>
                      <span>{formatarDataHora(item.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-zinc-700">{item.conteudo}</p>
                    {item.autor && <p className="mt-1 text-xs text-zinc-400">- {item.autor}</p>}
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function CampoEditavel({
  label,
  valor,
  onSalvar,
}: {
  label: string;
  valor: string;
  onSalvar: (valor: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(valor);

  useEffect(() => setRascunho(valor), [valor]);

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-zinc-700">{label}</span>
      <input
        value={rascunho}
        onChange={(e) => setRascunho(e.target.value)}
        onFocus={() => setEditando(true)}
        onBlur={() => {
          setEditando(false);
          if (rascunho !== valor) onSalvar(rascunho);
        }}
        className={`rounded-lg border px-3 py-2 text-sm ${editando ? "border-zinc-500" : "border-zinc-300"}`}
      />
    </label>
  );
}
