"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(data.error ?? "Não foi possível entrar");
        setLoading(false);
        return;
      }
      router.push(data.redirect ?? "/app");
      router.refresh();
    } catch {
      setErro("Erro de conexão. Tente novamente.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-100 to-slate-200 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Porta Voz" className="h-16 w-16 rounded-2xl shadow-lg shadow-blue-900/20" />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Porta Voz</h1>
            <p className="text-sm text-slate-500">Painel da Comunicação</p>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-700">E-mail</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
              placeholder="voce@prefeitura.gov.br"
              required
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-700">Senha</span>
            <input
              type="password"
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
              placeholder="••••••••"
              required
            />
          </label>

          {erro && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-60"
          >
            {loading && <LoaderCircle className="h-4 w-4 animate-spin" />}
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-slate-400">
          Cada prefeitura acessa apenas os seus próprios dados.
        </p>
      </div>
    </div>
  );
}
