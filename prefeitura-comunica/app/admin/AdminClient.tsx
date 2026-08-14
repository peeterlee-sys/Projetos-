"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Building2, FileText, Send, Users, LogOut, LoaderCircle } from "lucide-react";

type Stats = {
  total: number; pendente: number; revisao: number; aprovado: number;
  publicado: number; aguardando: number; secretarios: number; secretariosAtivos: number;
};
type Pref = { id: string; nome: string; municipio: string; uf: string; ativo: boolean; slug: string; stats: Stats };
type Overview = {
  prefeituras: Pref[];
  totals: { prefeituras: number; releases: number; publicados: number; secretarios: number };
};

export default function AdminClient() {
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/overview", { cache: "no-store" }).then(async (r) => {
      if (r.status === 401) { router.push("/login"); return; }
      setData(await r.json());
      setLoading(false);
    });
  }, [router]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  if (loading || !data) {
    return <div className="flex min-h-screen items-center justify-center text-slate-400"><LoaderCircle className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 max-sm:px-4">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white"><ShieldCheck className="h-5 w-5" /></div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Painel do Administrador</h1>
            <p className="text-sm text-slate-500">Visão geral de todas as prefeituras</p>
          </div>
        </div>
        <button onClick={logout} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-500 hover:text-slate-800"><LogOut className="h-4 w-4" />Sair</button>
      </header>

      <div className="mb-6 grid grid-cols-4 gap-3 max-sm:grid-cols-2">
        <Stat icon={<Building2 className="h-4 w-4" />} value={data.totals.prefeituras} label="Prefeituras" />
        <Stat icon={<FileText className="h-4 w-4" />} value={data.totals.releases} label="Releases (total)" />
        <Stat icon={<Send className="h-4 w-4" />} value={data.totals.publicados} label="Publicados" />
        <Stat icon={<Users className="h-4 w-4" />} value={data.totals.secretarios} label="Secretários" />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-3 text-sm font-bold">Prefeituras</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-5 py-2 font-semibold">Prefeitura</th>
                <th className="py-2 font-semibold">Secretários</th>
                <th className="py-2 font-semibold">Pendentes</th>
                <th className="py-2 font-semibold">Em revisão</th>
                <th className="py-2 font-semibold">Publicados</th>
                <th className="py-2 font-semibold">Total</th>
                <th className="py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.prefeituras.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-5 py-3">
                    <div className="font-semibold">{p.nome}</div>
                    <div className="text-xs text-slate-500">{p.municipio} · {p.uf}</div>
                  </td>
                  <td className="tabular-nums">{p.stats.secretariosAtivos}<span className="text-slate-400">/{p.stats.secretarios}</span></td>
                  <td className="tabular-nums">{p.stats.pendente + p.stats.aguardando}</td>
                  <td className="tabular-nums">{p.stats.revisao}</td>
                  <td className="tabular-nums">{p.stats.publicado}</td>
                  <td className="font-semibold tabular-nums">{p.stats.total}</td>
                  <td>
                    {p.ativo
                      ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Ativa</span>
                      : <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">Inativa</span>}
                  </td>
                </tr>
              ))}
              {data.prefeituras.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-slate-400">Nenhuma prefeitura cadastrada.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500">{icon}</div>
      <div className="text-2xl font-bold tabular-nums leading-none">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{label}</div>
    </div>
  );
}
