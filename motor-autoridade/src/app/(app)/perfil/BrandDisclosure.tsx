"use client";

import { useState } from "react";
import { BrandSettings } from "./BrandSettings";

type BrandInitial = Partial<{
  brand_primary: string;
  brand_secondary: string;
  brand_accent: string;
  logo_url: string | null;
}>;

/**
 * Linha "Identidade visual" (estilo MVP): mostra as cores atuais e abre o
 * editor completo de marca ao ser tocada.
 */
export function BrandDisclosure({
  initial,
  preview,
}: {
  initial: BrandInitial;
  preview: { primary: string; accent: string };
}) {
  const [open, setOpen] = useState(false);

  if (open) {
    return <BrandSettings initial={initial} />;
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="flex w-full items-center gap-3 rounded-[24px] bg-white p-5 text-left ring-1 ring-sand-200 transition hover:ring-sand-300"
    >
      <span className="flex shrink-0 -space-x-1.5">
        <span
          className="h-6 w-6 rounded-full ring-2 ring-white"
          style={{ backgroundColor: preview.primary }}
        />
        <span
          className="h-6 w-6 rounded-full ring-2 ring-white"
          style={{ backgroundColor: preview.accent }}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-ink-900">Identidade visual</span>
        <span className="block text-sm text-ink-500">Cores e logo das suas peças</span>
      </span>
      <span className="shrink-0 text-ink-400">→</span>
    </button>
  );
}
