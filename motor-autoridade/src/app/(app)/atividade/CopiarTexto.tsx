"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Copia o documento inteiro — é o que o assessor faz antes de revisar e publicar. */
export function CopiarTexto({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copiar}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-700 px-3.5 py-1.5 text-xs font-medium text-sand-50 transition hover:bg-brand-800"
    >
      {copiado ? <Check size={14} /> : <Copy size={14} />}
      {copiado ? "Copiado" : "Copiar texto"}
    </button>
  );
}
