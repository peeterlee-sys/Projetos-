"use client";

import { useState, useTransition } from "react";
import { setUserActive } from "./actions";
import type { PendingRow } from "@/lib/admin/overview";

function when(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Lista de cadastros pendentes com botão de aprovar. */
export function PendingApprovals({ pending }: { pending: PendingRow[] }) {
  const [rows, setRows] = useState(pending);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (rows.length === 0) return null;

  function approve(id: string) {
    setError(null);
    setBusy(id);
    startTransition(async () => {
      const res = await setUserActive({ userId: id, active: true });
      setBusy(null);
      if (!res.ok) setError(res.error);
      else setRows((r) => r.filter((x) => x.id !== id));
    });
  }

  return (
    <section className="rounded-2xl bg-gold-300/15 p-5 ring-1 ring-gold-300/50">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gold-700">
          Cadastros aguardando aprovação
        </h2>
        <span className="rounded-full bg-gold-500 px-2 py-0.5 text-xs font-medium text-white">
          {rows.length}
        </span>
      </div>
      <ul className="space-y-2">
        {rows.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between gap-3 rounded-xl bg-white/70 px-4 py-3 ring-1 ring-sand-200"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-ink-900">{p.name ?? p.email}</p>
              <p className="truncate text-xs text-ink-400">
                {p.email}
                {p.createdAt ? ` · cadastrou em ${when(p.createdAt)}` : ""}
              </p>
            </div>
            <button
              onClick={() => approve(p.id)}
              disabled={busy === p.id}
              className="shrink-0 rounded-full bg-brand-700 px-4 py-2 text-sm text-sand-50 transition hover:bg-brand-800 disabled:opacity-50"
            >
              {busy === p.id ? "Aprovando…" : "Aprovar"}
            </button>
          </li>
        ))}
      </ul>
      {error ? <p className="mt-2 text-sm text-danger-600">{error}</p> : null}
    </section>
  );
}
