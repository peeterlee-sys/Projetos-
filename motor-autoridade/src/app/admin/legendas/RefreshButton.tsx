"use client";

import { useState, useTransition } from "react";
import { refreshEditRequests } from "./actions";

/** Reconsulta os pedidos abertos no ZapCap e recarrega a lista. */
export function RefreshButton({ disabled = false }: { disabled?: boolean }) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await refreshEditRequests();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.checked === 0) {
        setMessage("Nenhum pedido aberto para consultar.");
        return;
      }
      const parts = [`${res.checked} consultado${res.checked > 1 ? "s" : ""}`];
      if (res.ready > 0) parts.push(`${res.ready} concluído${res.ready > 1 ? "s" : ""}`);
      if (res.failed > 0) parts.push(`${res.failed} com falha`);
      setMessage(parts.join(" · "));
    });
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={run}
        disabled={disabled || pending}
        className="rounded-full bg-brand-700 px-4 py-2 text-sm text-sand-50 transition hover:bg-brand-800 disabled:opacity-50"
      >
        {pending ? "Consultando…" : "Atualizar status"}
      </button>
      {message ? <p className="mt-1 text-xs text-ink-500">{message}</p> : null}
      {error ? <p className="mt-1 text-xs text-danger-600">{error}</p> : null}
    </div>
  );
}
