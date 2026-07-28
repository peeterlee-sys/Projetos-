"use client";

import { useState, useTransition } from "react";
import { subscribeToPlan } from "./actions";

const PLANS = [
  { id: "monthly" as const, label: "Mensal", price: "R$ 197", detail: "por mês" },
  { id: "yearly" as const, label: "Anual", price: "R$ 1.970", detail: "por ano (2 meses de desconto)" },
];

function formatCpf(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function PlanForm() {
  const [plan, setPlan] = useState<"monthly" | "yearly">("monthly");
  const [cpf, setCpf] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="mt-6 space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await subscribeToPlan(plan, cpf);
          if (result && !result.ok) setError(result.error);
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        {PLANS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPlan(p.id)}
            className={`rounded-2xl border p-4 text-left transition ${
              plan === p.id ? "border-brand-700 bg-brand-700/5" : "border-sand-200 bg-white/70"
            }`}
          >
            <p className="text-sm font-medium text-ink-900">{p.label}</p>
            <p className="mt-1 font-serif text-xl text-brand-700">{p.price}</p>
            <p className="text-xs text-ink-500">{p.detail}</p>
          </button>
        ))}
      </div>

      <div>
        <label htmlFor="cpf" className="text-sm font-medium text-ink-700">
          CPF (pra gerar o pagamento no Asaas)
        </label>
        <input
          id="cpf"
          inputMode="numeric"
          value={cpf}
          onChange={(e) => setCpf(formatCpf(e.target.value))}
          placeholder="000.000.000-00"
          required
          className="mt-1.5 w-full rounded-xl border border-sand-200 bg-white/70 px-4 py-3 text-[15px] outline-none focus:border-brand-700"
        />
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-full bg-brand-700 px-6 py-3.5 text-[15px] font-medium text-sand-50 transition hover:bg-brand-800 disabled:opacity-60"
      >
        {isPending ? "Gerando pagamento…" : "Continuar para o pagamento"}
      </button>
    </form>
  );
}
