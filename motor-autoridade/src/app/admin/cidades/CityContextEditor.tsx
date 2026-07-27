"use client";

import { useState, useTransition } from "react";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { deleteCityContext, upsertCityContext } from "./actions";

export type CityContext = {
  id: string;
  city: string;
  state: string;
  context: string;
  updatedAt: string;
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

type Draft = { city: string; state: string; context: string };
const EMPTY_DRAFT: Draft = { city: "", state: "", context: "" };

/**
 * Biblioteca de cidades: um contexto por cidade/UF, escrito pelo admin e
 * herdado por todo vereador dessa cidade — na anamnese (quem ainda não tem) e
 * retroativo (quem já respondeu, ao salvar o contexto aqui).
 */
export function CityContextEditor({ initial }: { initial: CityContext[] }) {
  const [items, setItems] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function startEdit(item?: CityContext) {
    setError(null);
    setInfo(null);
    setEditing(item?.id ?? "new");
    setDraft(item ? { city: item.city, state: item.state, context: item.context } : EMPTY_DRAFT);
  }

  function save() {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const id = editing !== "new" ? (editing ?? undefined) : undefined;
      const res = await upsertCityContext({ ...draft, id });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditing(null);
      if (res.appliedTo) {
        setInfo(
          `Salvo. Aplicado a ${res.appliedTo} vereador${res.appliedTo === 1 ? "" : "es"} dessa cidade que ainda não tinham contexto.`
        );
      }
      // Recarrega a lista da forma mais simples: o server action já revalida
      // a rota, mas como este componente é client, forçamos uma atualização
      // otimista local para não esperar a navegação.
      setItems((prev) => {
        const others = prev.filter((p) => !(p.city === draft.city && p.state === draft.state.toUpperCase()));
        return [
          ...others,
          {
            id: id ?? crypto.randomUUID(),
            city: draft.city,
            state: draft.state.toUpperCase(),
            context: draft.context,
            updatedAt: new Date().toISOString(),
          },
        ].sort((a, b) => a.city.localeCompare(b.city));
      });
    });
  }

  function remove(id: string) {
    if (!confirm("Remover o contexto desta cidade?")) return;
    startTransition(async () => {
      const res = await deleteCityContext(id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setItems((prev) => prev.filter((p) => p.id !== id));
    });
  }

  return (
    <div className="space-y-4">
      {editing ? (
        <div className="space-y-3 rounded-2xl bg-white/80 p-4 ring-1 ring-sand-200">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="Cidade">
                <Input value={draft.city} onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))} />
              </Field>
            </div>
            <Field label="UF">
              <Input
                value={draft.state}
                onChange={(e) => setDraft((d) => ({ ...d, state: e.target.value.toUpperCase().slice(0, 2) }))}
                placeholder="SC"
              />
            </Field>
          </div>
          <Field label="Contexto" hint="População, economia, principais problemas, obras em andamento…">
            <Textarea
              value={draft.context}
              onChange={(e) => setDraft((d) => ({ ...d, context: e.target.value }))}
              className="min-h-32"
            />
          </Field>
          {error ? <p className="text-sm text-danger-600">{error}</p> : null}
          <div className="flex gap-2">
            <Button onClick={save} disabled={pending}>
              {pending ? "Salvando…" : "Salvar"}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={pending}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => startEdit()}>+ Nova cidade</Button>
      )}

      {info ? <p className="text-sm text-brand-700">{info}</p> : null}

      {items.length === 0 ? (
        <div className="rounded-2xl bg-white/80 p-8 text-center text-sm text-ink-500 ring-1 ring-sand-200">
          Nenhuma cidade cadastrada ainda.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-2xl bg-white/80 p-4 ring-1 ring-sand-200">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-ink-900">
                    {item.city}/{item.state}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-400">Atualizado em {fmt(item.updatedAt)}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="ghost" onClick={() => startEdit(item)} disabled={pending}>
                    Editar
                  </Button>
                  <Button variant="ghost" onClick={() => remove(item.id)} disabled={pending}>
                    Remover
                  </Button>
                </div>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-ink-700">{item.context}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
