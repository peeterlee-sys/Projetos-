"use client";

import { Button, Field, Input } from "@/components/ui";
import { vocativoDe, type Autoridade } from "@/lib/autoridades";

const VAZIA: Autoridade = { cargo: "", nome: "", genero: "m", orgao: "" };

const selectClass =
  "w-full rounded-2xl border border-sand-300 bg-sand-50 px-4 py-3 text-ink-900 outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-700/20";

/**
 * Autoridades da cidade — a lista de nomes que o assistente está autorizado a
 * escrever num ofício, requerimento ou indicação.
 *
 * É deliberadamente uma lista fechada: o que não está aqui o assistente não
 * inventa. Se o vereador pedir um ofício para alguém que não consta, o nome
 * sai exatamente como ele escreveu, sem tratamento inventado, com aviso para
 * conferir antes de protocolar.
 */
export function AutoridadesEditor({
  value,
  onChange,
  disabled,
}: {
  value: Autoridade[];
  onChange: (next: Autoridade[]) => void;
  disabled?: boolean;
}) {
  function update(index: number, patch: Partial<Autoridade>) {
    onChange(value.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-ink-700">Autoridades da cidade</p>
        <p className="mt-0.5 text-xs text-ink-400">
          Prefeito(a), presidente da Câmara, secretários — quem os documentos oficiais precisam
          citar pelo nome. Escreva o cargo já no gênero certo (&ldquo;Prefeita&rdquo;,
          &ldquo;Secretário de Obras&rdquo;). Nome que não estiver nesta lista o assistente não
          escreve por conta própria.
        </p>
      </div>

      {value.length === 0 ? (
        <p className="rounded-xl bg-sand-100 px-4 py-3 text-sm text-ink-500">
          Nenhuma autoridade cadastrada. Sem isso, os ofícios e requerimentos desta cidade saem com
          a forma genérica (&ldquo;Excelentíssimo Senhor Prefeito&rdquo;, sem nome).
        </p>
      ) : (
        <div className="space-y-3">
          {value.map((a, i) => (
            <div key={i} className="space-y-3 rounded-xl bg-sand-100 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Cargo">
                  <Input
                    value={a.cargo}
                    disabled={disabled}
                    placeholder="Prefeita"
                    onChange={(e) => update(i, { cargo: e.target.value })}
                  />
                </Field>
                <Field label="Nome">
                  <Input
                    value={a.nome}
                    disabled={disabled}
                    placeholder="Maria Souza"
                    onChange={(e) => update(i, { nome: e.target.value })}
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Gênero" hint="Define o pronome de tratamento.">
                  <select
                    className={selectClass}
                    value={a.genero}
                    disabled={disabled}
                    onChange={(e) => update(i, { genero: e.target.value as Autoridade["genero"] })}
                  >
                    <option value="m">Masculino — Excelentíssimo Senhor</option>
                    <option value="f">Feminino — Excelentíssima Senhora</option>
                  </select>
                </Field>
                <Field label="Órgão (opcional)">
                  <Input
                    value={a.orgao ?? ""}
                    disabled={disabled}
                    placeholder="Prefeitura Municipal de Tijucas"
                    onChange={(e) => update(i, { orgao: e.target.value })}
                  />
                </Field>
              </div>

              <div className="flex items-center justify-between gap-3">
                {/* O admin confere aqui a linha exata que vai sair no documento,
                    em vez de descobrir o erro de concordância já protocolado. */}
                <p className="min-w-0 truncate text-xs text-ink-500">
                  {a.cargo && a.nome ? (
                    <>
                      Sai no documento como: <span className="text-ink-700">{vocativoDe(a)}</span>
                    </>
                  ) : (
                    "Preencha cargo e nome."
                  )}
                </p>
                <Button
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                >
                  Remover
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button variant="ghost" disabled={disabled} onClick={() => onChange([...value, { ...VAZIA }])}>
        + Adicionar autoridade
      </Button>
    </div>
  );
}
