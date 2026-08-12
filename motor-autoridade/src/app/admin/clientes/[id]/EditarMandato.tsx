"use client";

import { useState, useTransition } from "react";
import { atualizarMandato } from "./actions";

type Campos = {
  phone: string;
  politicalName: string;
  city: string;
  state: string;
  party: string;
};

function Campo({
  label,
  valor,
  onChange,
  dica,
  placeholder,
  maxLength,
  largura = "",
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  dica?: string;
  placeholder?: string;
  maxLength?: number;
  largura?: string;
}) {
  return (
    <label className={`block ${largura}`}>
      <span className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{label}</span>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="mt-1 w-full rounded-xl border border-sand-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400"
      />
      {dica ? <span className="mt-1 block text-xs text-ink-400">{dica}</span> : null}
    </label>
  );
}

/**
 * Edição dos dados do mandato. O WhatsApp é a chave de reconhecimento do
 * assistente: antes disso, corrigir um número errado exigia SQL em produção.
 */
export function EditarMandato({ userId, inicial }: { userId: string; inicial: Campos }) {
  const [campos, setCampos] = useState<Campos>(inicial);
  const [feedback, setFeedback] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const alterado = (Object.keys(campos) as (keyof Campos)[]).some(
    (k) => campos[k].trim() !== inicial[k].trim()
  );

  function set(k: keyof Campos) {
    return (v: string) => {
      setCampos((c) => ({ ...c, [k]: v }));
      setFeedback(null);
    };
  }

  function salvar() {
    startTransition(async () => {
      const r = await atualizarMandato({ userId, ...campos });
      setFeedback(
        r.ok
          ? { ok: true, texto: r.aviso ?? "Salvo." }
          : { ok: false, texto: r.error }
      );
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo
          label="WhatsApp"
          valor={campos.phone}
          onChange={set("phone")}
          placeholder="(48) 99992-7518"
          dica="Deixe vazio para liberar o número e usá-lo em outro mandato."
        />
        <Campo
          label="Nome político"
          valor={campos.politicalName}
          onChange={set("politicalName")}
          placeholder="Como aparece na urna"
        />
        <Campo label="Cidade" valor={campos.city} onChange={set("city")} placeholder="Tijucas" />
        <div className="grid grid-cols-2 gap-3">
          <Campo label="UF" valor={campos.state} onChange={set("state")} maxLength={2} placeholder="SC" />
          <Campo label="Partido" valor={campos.party} onChange={set("party")} placeholder="PL" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={salvar}
          disabled={pending || !alterado}
          className="rounded-full bg-brand-700 px-4 py-1.5 text-sm text-sand-50 transition hover:bg-brand-800 disabled:opacity-50"
        >
          {pending ? "Salvando…" : "Salvar alterações"}
        </button>
        {alterado && !pending ? (
          <button
            type="button"
            onClick={() => {
              setCampos(inicial);
              setFeedback(null);
            }}
            className="text-xs text-ink-500 underline-offset-2 hover:underline"
          >
            Descartar
          </button>
        ) : null}
        {feedback ? (
          <span className={`text-xs ${feedback.ok ? "text-brand-700" : "text-danger-700"}`}>
            {feedback.texto}
          </span>
        ) : null}
      </div>
    </div>
  );
}
