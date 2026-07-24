"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteContentItem } from "./actions";

type Props = {
  id: string;
  title: string;
  subtitle: string;
  badgeLabel: string;
  badgeCls: string;
};

export function LibraryItem({ id, title, subtitle, badgeLabel, badgeCls }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function remove() {
    startTransition(async () => {
      await deleteContentItem(id);
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <div className="relative rounded-[24px] bg-white shadow-sm ring-1 ring-sand-200 transition hover:ring-sand-300">
      <Link href={`/conteudo/${id}`} className="flex items-start justify-between gap-3 p-5 pr-12">
        <div className="min-w-0">
          <p className="font-medium text-ink-900">{title}</p>
          <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${badgeCls}`}
        >
          {badgeLabel}
        </span>
      </Link>

      {/* Botão de excluir (canto inferior direito) */}
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full text-ink-400 transition hover:bg-sand-100 hover:text-danger-600"
        aria-label="Excluir"
        title="Excluir"
      >
        🗑
      </button>

      {confirming ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-[24px] bg-white/95 px-5 text-center">
          <p className="text-sm text-ink-800">Excluir este conteúdo?</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="rounded-full bg-danger-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-danger-700 disabled:opacity-50"
            >
              {pending ? "Excluindo…" : "Excluir"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="rounded-full bg-sand-200 px-5 py-2.5 text-sm font-medium text-ink-900 transition hover:bg-sand-300"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
