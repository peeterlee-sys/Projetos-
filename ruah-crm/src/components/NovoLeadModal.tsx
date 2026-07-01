"use client";

import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import type { Lead } from "@/lib/types";

export function NovoLeadModal({
  onFechar,
  onCriado,
}: {
  onFechar: () => void;
  onCriado: (lead: Lead) => void;
}) {
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro(null);
    setSalvando(true);

    const form = new FormData(event.currentTarget);
    const payload = {
      nomeContato: String(form.get("nomeContato") || ""),
      telefone: String(form.get("telefone") || "") || null,
      email: String(form.get("email") || "") || null,
      segmento: String(form.get("segmento") || "") || null,
      canalOrigem: String(form.get("canalOrigem") || "") || null,
      valorNegociacao: form.get("valorNegociacao") ? Number(form.get("valorNegociacao")) : null,
    };

    const resposta = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSalvando(false);
    if (!resposta.ok) {
      setErro("Nao foi possivel criar o lead. Verifique os campos.");
      return;
    }
    onCriado(await resposta.json());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">Novo lead</h2>
          <button onClick={onFechar} className="text-zinc-400 hover:text-zinc-700">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Campo label="Nome do contato *" name="nomeContato" required />
          <Campo label="Telefone / WhatsApp" name="telefone" placeholder="+55 11 99999-9999" />
          <Campo label="E-mail" name="email" type="email" />
          <Campo label="Segmento" name="segmento" placeholder="Ex: Varejo" />
          <Campo label="Canal de origem" name="canalOrigem" placeholder="Ex: Indicacao, WhatsApp, Instagram" />
          <Campo label="Valor em negociacao (R$)" name="valorNegociacao" type="number" step="0.01" />

          {erro && <p className="text-sm text-red-600">{erro}</p>}

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onFechar}
              className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {salvando ? "Salvando..." : "Criar lead"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Campo({
  label,
  name,
  type = "text",
  required,
  placeholder,
  step,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  step?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-zinc-700">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        step={step}
        className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
      />
    </label>
  );
}
