"use client";

import { useMemo, useState, useTransition } from "react";
import { Button, Input } from "@/components/ui";
import {
  deleteSegmentSource,
  toggleSegmentSource,
  upsertSegmentSource,
  type SourceActionResult,
} from "./actions";

export type SegmentSource = {
  id: string;
  segment: string;
  name: string;
  url: string | null;
  kind: "news" | "rss" | "institutional";
  priority: "high" | "medium" | "low";
  is_active: boolean;
};

const SEGMENT_LABEL: Record<string, string> = {
  advogados: "Advocacia",
  medicos: "Medicina / Saúde",
  politicos: "Política",
  pastores: "Ministério / Igreja",
  empresarios: "Empresas / Negócios",
  corretores: "Mercado imobiliário",
  arquitetos: "Arquitetura",
};
const PRIORITY_LABEL: Record<string, string> = { high: "Alta", medium: "Média", low: "Baixa" };
const PRIORITY_STYLE: Record<string, string> = {
  high: "bg-success-100 text-brand-700",
  medium: "bg-gold-300/40 text-gold-700",
  low: "bg-sand-200 text-ink-500",
};
const KIND_LABEL: Record<string, string> = {
  news: "Notícias",
  rss: "RSS",
  institutional: "Institucional",
};

const selectBase =
  "rounded-xl border border-sand-300 bg-sand-50 px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-700/20";

type Draft = {
  segment: string;
  name: string;
  url: string;
  kind: SegmentSource["kind"];
  priority: SegmentSource["priority"];
};

const EMPTY_DRAFT: Draft = { segment: "", name: "", url: "", kind: "news", priority: "medium" };

export function SourcesEditor({ initial, canEdit }: { initial: SegmentSource[]; canEdit: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY_DRAFT);

  const grouped = useMemo(() => {
    const map = new Map<string, SegmentSource[]>();
    for (const s of initial) {
      const list = map.get(s.segment) ?? [];
      list.push(s);
      map.set(s.segment, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [initial]);

  const knownSegments = useMemo(
    () => [...new Set([...Object.keys(SEGMENT_LABEL), ...initial.map((s) => s.segment)])].sort(),
    [initial]
  );

  const run = (fn: () => Promise<SourceActionResult>, after?: () => void) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error);
      else after?.();
    });
  };

  return (
    <div className="space-y-6">
      {/* Formulário de nova fonte */}
      {canEdit ? (
        <section className="rounded-2xl bg-white/80 p-5 ring-1 ring-sand-200">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-400">
            Adicionar fonte
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="lg:col-span-1">
              <input
                list="segments"
                className={`${selectBase} w-full`}
                placeholder="Segmento"
                value={draft.segment}
                onChange={(e) => setDraft({ ...draft, segment: e.target.value })}
              />
              <datalist id="segments">
                {knownSegments.map((s) => (
                  <option key={s} value={s}>
                    {SEGMENT_LABEL[s] ?? s}
                  </option>
                ))}
              </datalist>
            </div>
            <div className="lg:col-span-2">
              <Input
                placeholder="Nome (ex.: Conjur)"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div className="lg:col-span-1">
              <Input
                placeholder="URL"
                value={draft.url}
                onChange={(e) => setDraft({ ...draft, url: e.target.value })}
              />
            </div>
            <select
              className={selectBase}
              value={draft.kind}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value as Draft["kind"] })}
            >
              {Object.entries(KIND_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <select
              className={selectBase}
              value={draft.priority}
              onChange={(e) => setDraft({ ...draft, priority: e.target.value as Draft["priority"] })}
            >
              {Object.entries(PRIORITY_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Button
              onClick={() =>
                run(() => upsertSegmentSource(draft), () => setDraft(EMPTY_DRAFT))
              }
              disabled={pending || !draft.segment.trim() || !draft.name.trim()}
            >
              {pending ? "Salvando…" : "Adicionar fonte"}
            </Button>
            {error ? <p className="text-sm text-danger-600">{error}</p> : null}
          </div>
        </section>
      ) : (
        <p className="rounded-2xl bg-gold-300/20 p-4 text-sm text-gold-700">
          Você é admin: pode visualizar a matriz. A edição é exclusiva de super administradores.
        </p>
      )}

      {/* Fontes agrupadas por segmento */}
      {grouped.length === 0 ? (
        <p className="rounded-2xl bg-white/80 p-8 text-center text-sm text-ink-500 ring-1 ring-sand-200">
          Nenhuma fonte cadastrada.
        </p>
      ) : (
        grouped.map(([segment, sources]) => (
          <section key={segment} className="rounded-2xl bg-white/80 p-5 ring-1 ring-sand-200">
            <div className="mb-3 flex items-center gap-3">
              <h2 className="font-serif text-lg text-ink-900">{SEGMENT_LABEL[segment] ?? segment}</h2>
              <span className="rounded-full bg-sand-100 px-2.5 py-0.5 text-xs text-ink-500">
                {sources.length} fonte{sources.length > 1 ? "s" : ""}
              </span>
            </div>
            <ul className="divide-y divide-sand-200">
              {sources.map((s) =>
                editing === s.id ? (
                  <li key={s.id} className="py-3">
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                      <Input
                        className="lg:col-span-2"
                        value={editDraft.name}
                        onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                      />
                      <Input
                        className="lg:col-span-2"
                        value={editDraft.url}
                        onChange={(e) => setEditDraft({ ...editDraft, url: e.target.value })}
                      />
                      <select
                        className={selectBase}
                        value={editDraft.kind}
                        onChange={(e) => setEditDraft({ ...editDraft, kind: e.target.value as Draft["kind"] })}
                      >
                        {Object.entries(KIND_LABEL).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                      <select
                        className={selectBase}
                        value={editDraft.priority}
                        onChange={(e) =>
                          setEditDraft({ ...editDraft, priority: e.target.value as Draft["priority"] })
                        }
                      >
                        {Object.entries(PRIORITY_LABEL).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Button
                        onClick={() =>
                          run(
                            () => upsertSegmentSource({ ...editDraft, id: s.id, segment: s.segment }),
                            () => setEditing(null)
                          )
                        }
                        disabled={pending}
                      >
                        Salvar
                      </Button>
                      <Button variant="ghost" onClick={() => setEditing(null)} disabled={pending}>
                        Cancelar
                      </Button>
                    </div>
                  </li>
                ) : (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                    <div className={`min-w-0 ${s.is_active ? "" : "opacity-50"}`}>
                      <p className="truncate font-medium text-ink-900">
                        {s.name}
                        {s.url ? (
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-2 text-xs font-normal text-ink-400 hover:text-brand-700"
                          >
                            {s.url.replace(/^https?:\/\//, "")}
                          </a>
                        ) : null}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${PRIORITY_STYLE[s.priority]}`}>
                          {PRIORITY_LABEL[s.priority]}
                        </span>
                        <span className="text-xs text-ink-400">{KIND_LABEL[s.kind] ?? s.kind}</span>
                        {!s.is_active ? (
                          <span className="text-xs text-danger-700">inativa</span>
                        ) : null}
                      </div>
                    </div>
                    {canEdit ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => {
                            setEditing(s.id);
                            setEditDraft({
                              segment: s.segment,
                              name: s.name,
                              url: s.url ?? "",
                              kind: s.kind,
                              priority: s.priority,
                            });
                          }}
                          className="rounded-full px-3 py-1.5 text-sm text-ink-500 hover:bg-sand-200"
                          disabled={pending}
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => run(() => toggleSegmentSource(s.id, !s.is_active))}
                          className="rounded-full px-3 py-1.5 text-sm text-ink-500 hover:bg-sand-200"
                          disabled={pending}
                        >
                          {s.is_active ? "Desativar" : "Ativar"}
                        </button>
                        <button
                          onClick={() => run(() => deleteSegmentSource(s.id))}
                          className="rounded-full px-3 py-1.5 text-sm text-danger-700 hover:bg-danger-600/10"
                          disabled={pending}
                        >
                          Remover
                        </button>
                      </div>
                    ) : null}
                  </li>
                )
              )}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
