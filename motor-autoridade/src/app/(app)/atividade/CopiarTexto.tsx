"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Copia um trecho para a área de transferência. Cada seção do documento tem o
 * seu — a legenda do Instagram vai para um lugar, o release para outro.
 */
export function CopiarTexto({
  texto,
  rotulo = "Copiar",
  discreto = false,
  cor,
}: {
  texto: string;
  rotulo?: string;
  discreto?: boolean;
  cor?: string;
}) {
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
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full text-xs font-medium transition ${
        discreto
          ? "px-2.5 py-1 hover:opacity-70"
          : "px-3.5 py-1.5 text-white hover:opacity-90"
      }`}
      style={
        discreto
          ? { color: cor ?? "#5a6478", background: "transparent" }
          : { background: cor ?? "#246bfd" }
      }
    >
      {copiado ? <Check size={14} /> : <Copy size={14} />}
      {copiado ? "Copiado" : rotulo}
    </button>
  );
}
