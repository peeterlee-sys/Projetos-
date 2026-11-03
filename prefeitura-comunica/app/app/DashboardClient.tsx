"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PushToggle from "./PushToggle";
import Splash from "./Splash";
import CardModal from "./CardModal";
import {
  Inbox, Users, FileText, BarChart3, LogOut, Check, Send, Eye,
  RotateCcw, Trash2, Plus, Phone, Image as ImageIcon, TriangleAlert, Search,
  X, Mic, Pencil, Power, LoaderCircle, Copy, ChevronLeft,
  UserPlus, Smartphone, Mail, BellRing, KeyRound, ChevronRight, Link2,
  Download, Radio, Home, Building2, Newspaper, Bell,
} from "lucide-react";

/* ---------------- Tipos ---------------- */
type Foto = { id: string; url: string | null; legenda: string | null };
type Status = "pendente" | "revisao" | "aprovado" | "publicado" | "aguardando";
type Vista = "visao" | "fila" | "distribuicao" | "clipagem" | "cadastro" | "equipe" | "contexto" | "ranking";
type Release = {
  id: string; secretarioNome: string | null; secretaria: string | null;
  origem: string | null; transcricao: string | null;
  headline: string | null; release: string | null; instagram: string | null; radio: string | null;
  status: Status; flag: boolean | null; aguardando: boolean | null;
  askMsg: string | null; caso: string | null;
  publicadoEm: string | null; criadoEm: string | null; fotos: Foto[];
};
type Secretario = {
  id: string; nome: string; cargo: string | null;
  secretaria: string | null; telefone: string; ativo: boolean;
};
type Contexto = {
  prefeito?: string | null; vice?: string | null; mandato?: string | null;
  lema?: string | null; programa?: string | null; tom?: string | null;
  hashtags?: string | null; bairros?: string | null; programas?: string | null;
  contexto?: string | null; modelos?: string[] | null;
  cor?: string | null; logoUrl?: string | null;
} | null;
type Prefeitura = { nome: string; municipio: string; uf: string } | null;
type Data = {
  user: { nome: string; email: string; papel: string };
  prefeitura: Prefeitura;
  releases: Release[];
  secretarios: Secretario[];
  contexto: Contexto;
};

/* ---------------- Helpers ---------------- */
const STATUS: Record<Status, { label: string; badge: string; dot: string }> = {
  pendente: { label: "Pendente", badge: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
  aguardando: { label: "Aguardando assunto", badge: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
  revisao: { label: "Em revisão", badge: "bg-sky-100 text-sky-800", dot: "bg-sky-500" },
  aprovado: { label: "Aprovado", badge: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" },
  publicado: { label: "Publicado", badge: "bg-slate-200 text-slate-700", dot: "bg-slate-500" },
};
const FILTERS: { key: Status; label: string }[] = [
  { key: "pendente", label: "Pendentes" },
  { key: "aguardando", label: "Aguardando assunto" },
  { key: "revisao", label: "Em revisão" },
  { key: "aprovado", label: "Aprovados" },
  { key: "publicado", label: "Publicados" },
];

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}
function fmtTel(t: string) {
  const d = (t || "").replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return t;
}
function fmtDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pt-BR");
}
function timeAgo(iso: string | null) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}
function composeContext(c: NonNullable<Contexto>, muni: string, uf: string) {
  const nl = (s?: string | null) => (s ?? "").split(/\n+/).map((x) => x.trim()).filter(Boolean);
  const L: string[] = [`Município: ${muni} — ${uf}`];
  if (c.prefeito) L.push(`Prefeito(a): ${c.prefeito}${c.vice ? "  ·  Vice: " + c.vice : ""}`);
  if (c.mandato) L.push(`Mandato: ${c.mandato}`);
  if (c.lema) L.push(`Lema da gestão: "${c.lema}"`);
  if (c.programa) L.push(`Plano de governo: ${c.programa}`);
  if (c.tom) L.push(`Tom de comunicação: ${c.tom}`);
  if (c.hashtags) L.push(`Hashtags oficiais: ${c.hashtags}`);
  if (c.bairros) L.push(`Bairros e localidades: ${nl(c.bairros).join(", ")}`);
  if (c.programas) L.push(`Programas e projetos da gestão:\n- ${nl(c.programas).join("\n- ")}`);
  if (c.contexto) L.push(`\n${c.contexto.trim()}`);
  const mods = (c.modelos ?? []).filter((m) => m && m.trim());
  if (mods.length) {
    L.push("\nMODELOS DE RELEASE (referência de estilo — imite o padrão de escrita, não o conteúdo):");
    mods.forEach((m, i) => L.push(`\n[Modelo ${i + 1}]\n${m.trim()}`));
  }
  return L.join("\n");
}

/* ---------------- Componente ---------------- */
export default function DashboardClient() {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<Vista>("visao");
  const [filter, setFilter] = useState<Status>("pendente");
  const [selId, setSelId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<Foto | null>(null);
  const [cardRel, setCardRel] = useState<Release | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/app/data", { cache: "no-store" });
    if (res.status === 401) { router.push("/login"); return; }
    const d = await res.json();
    setData(d);
    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 2200);
  }
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  async function dedupe() {
    if (!confirm("Remover releases duplicados? Mantém o mais antigo de cada e apaga as cópias.")) return;
    try {
      const r = await fetch("/api/releases/dedupe", { method: "POST" });
      const j = await r.json();
      flash(j.removed ? `${j.removed} duplicado(s) removido(s) 🧹` : "Nenhum duplicado encontrado");
      await load();
    } catch {
      flash("Não consegui limpar agora.");
    }
  }

  function go(v: typeof view, f?: Status) { setView(v); if (f) setFilter(f); setSelId(null); }
  function openRelease(r: Release) { setView("fila"); setFilter(r.status); setSelId(r.id); }

  const releases = data?.releases ?? [];
  const secretarios = data?.secretarios ?? [];
  const muni = data?.prefeitura?.municipio ?? "";
  const uf = data?.prefeitura?.uf ?? "SC";
  const prefNome = data?.prefeitura?.nome ?? "Prefeitura";
  const pendentesCount = releases.filter((r) => r.status === "pendente" || r.status === "aguardando").length;
  const META: Record<string, [string, string]> = {
    visao: ["Central de Comunicação", "Organize a produção, distribua para a imprensa e acompanhe os resultados da sua prefeitura."],
    fila: ["Produção", "Gerencie os conteúdos recebidos das secretarias, revise e aprove."],
    distribuicao: ["Distribuição", "Envie seus conteúdos para a imprensa e acompanhe os envios."],
    clipagem: ["Clipagem", "Acompanhe as publicações na imprensa sobre as ações da prefeitura."],
    cadastro: ["Secretarias", "Secretários reconhecidos pelo sistema no WhatsApp."],
    ranking: ["Relatórios", "Resultados da comunicação — base para o relatório mensal."],
    contexto: ["Contexto da cidade", "A anamnese do município — o que a IA usa para escrever no tom certo."],
    equipe: ["Equipe de comunicação", "Quem recebe o aviso de release novo no celular."],
  };
  const [titulo, subtitulo] = META[view] ?? META.visao;

  const ranking = useMemo(() => {
    const map = new Map<string, { sec: string; nome: string; total: number; publicado: number }>();
    for (const r of releases) {
      const key = r.secretaria ?? "—";
      const cur = map.get(key) ?? { sec: key, nome: r.secretarioNome ?? "", total: 0, publicado: 0 };
      cur.total++;
      cur.nome = r.secretarioNome ?? cur.nome;
      if (r.status === "publicado") cur.publicado++;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.total - a.total || b.publicado - a.publicado);
  }, [releases]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        <LoaderCircle className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="grid min-h-screen grid-cols-[256px_1fr] bg-slate-50 max-lg:grid-cols-1">
      <Splash nome={data?.prefeitura?.nome} />
      {/* Sidebar (escura) */}
      <aside className="flex flex-col gap-1 bg-[#0e1b33] p-3.5 max-lg:hidden">
        <div className="mb-4 flex items-center gap-2.5 px-2 pt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Porta Voz" className="h-9 w-9 rounded-xl" />
          <span className="text-lg font-bold text-white">Porta Voz</span>
        </div>

        <DarkNav icon={<Home className="h-[18px] w-[18px]" />} label="Visão Geral" active={view === "visao"} onClick={() => go("visao")} />
        <DarkNav icon={<Pencil className="h-[18px] w-[18px]" />} label="Produção" badge={pendentesCount || undefined} active={view === "fila"} onClick={() => go("fila", "pendente")} />
        <DarkNav icon={<Send className="h-[18px] w-[18px]" />} label="Distribuição" soon active={view === "distribuicao"} onClick={() => go("distribuicao")} />
        <DarkNav icon={<Newspaper className="h-[18px] w-[18px]" />} label="Clipagem" soon active={view === "clipagem"} onClick={() => go("clipagem")} />
        <DarkNav icon={<Users className="h-[18px] w-[18px]" />} label="Secretarias" badge={secretarios.length || undefined} active={view === "cadastro"} onClick={() => go("cadastro")} />
        <DarkNav icon={<BarChart3 className="h-[18px] w-[18px]" />} label="Relatórios" active={view === "ranking"} onClick={() => go("ranking")} />
        <div className="my-2 border-t border-white/10" />
        <DarkNav icon={<FileText className="h-[18px] w-[18px]" />} label="Contexto da cidade" active={view === "contexto"} onClick={() => go("contexto")} />
        <DarkNav icon={<BellRing className="h-[18px] w-[18px]" />} label="Equipe" active={view === "equipe"} onClick={() => go("equipe")} />

        <div className="mt-auto space-y-2.5 pt-4">
          <PushToggle />
          <div className="flex items-center gap-2.5 rounded-xl bg-white/5 px-3 py-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-slate-200"><Building2 className="h-5 w-5" /></div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">{prefNome}</div>
              <div className="text-[11px] text-slate-400">Prefeitura</div>
            </div>
          </div>
          <button onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 hover:text-white">
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex min-w-0 flex-col max-lg:pb-24">
        {/* Topbar */}
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4 max-lg:px-4">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight text-slate-900 max-sm:text-xl">{titulo}</h1>
            <p className="truncate text-sm text-slate-500">{subtitulo}</p>
          </div>
          <div className="flex items-center gap-2.5">
            {(view === "fila" || view === "cadastro") && (
              <div className="relative max-md:hidden">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar…"
                  className="w-52 rounded-full border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                />
              </div>
            )}
            <button onClick={() => go("fila", "pendente")} className="relative rounded-full border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50" title="Pendências">
              <Bell className="h-5 w-5" />
              {pendentesCount > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />}
            </button>
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 max-sm:hidden">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">S</div>
              <div className="leading-tight">
                <div className="text-sm font-semibold text-slate-800">Secom</div>
                <div className="text-[11px] text-slate-500">Secretaria de Comunicação</div>
              </div>
            </div>
          </div>
        </header>

        {/* Push no mobile */}
        <div className="px-4 pt-3 lg:hidden"><PushToggle /></div>

        {/* KPIs — telas internas (a Visão Geral tem os próprios) */}
        {(view === "fila" || view === "cadastro" || view === "ranking") && (
          <Kpis view={view} releases={releases} secretarios={secretarios} ranking={ranking} />
        )}

        <div className="flex-1 p-6 max-lg:p-4">
          {view === "visao" && (
            <VisaoGeral releases={releases} ranking={ranking} go={go} openRelease={openRelease} />
          )}
          {(view === "distribuicao" || view === "clipagem") && <EmBreve tipo={view} />}
          {view === "fila" && (
            <div className="mb-3 flex justify-end">
              <button
                onClick={dedupe}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> Limpar duplicados
              </button>
            </div>
          )}
          {view === "fila" && (
            <div className="mb-3 flex gap-2 overflow-x-auto lg:hidden">
              {FILTERS.map((f) => {
                const n = releases.filter((r) => r.status === f.key).length;
                const active = filter === f.key;
                return (
                  <button
                    key={f.key}
                    onClick={() => { setFilter(f.key); setSelId(null); }}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${active ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-200 text-slate-600"}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${STATUS[f.key].dot}`} />
                    {f.label}
                    <span className="tabular-nums opacity-70">{n}</span>
                  </button>
                );
              })}
            </div>
          )}
          {view === "fila" && (
            <Fila
              releases={releases} filter={filter} query={query}
              selId={selId} setSelId={setSelId}
              flash={flash} reload={load} openFoto={setLightbox} openCard={setCardRel}
            />
          )}
          {view === "cadastro" && (
            <Cadastro secretarios={secretarios} query={query} flash={flash} reload={load} goEquipe={() => setView("equipe")} />
          )}
          {view === "equipe" && (
            <Equipe flash={flash} goSecretarios={() => { setView("cadastro"); setSelId(null); }} prefNome={data?.prefeitura?.nome ?? null} />
          )}
          {view === "contexto" && data?.contexto !== undefined && (
            <ContextoView contexto={data.contexto} muni={muni} uf={uf} flash={flash} reload={load} />
          )}
          {view === "ranking" && <Ranking ranking={ranking} muni={muni} />}
        </div>
      </main>

      {/* Navegação mobile (barra inferior) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {([
          { key: "visao", label: "Início", icon: <Home className="h-5 w-5" /> },
          { key: "fila", label: "Produção", icon: <Inbox className="h-5 w-5" /> },
          { key: "cadastro", label: "Secretarias", icon: <Users className="h-5 w-5" /> },
          { key: "ranking", label: "Relatórios", icon: <BarChart3 className="h-5 w-5" /> },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => { setView(t.key); setSelId(null); }}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${view === t.key ? "text-blue-700" : "text-slate-500"}`}
          >
            {t.icon}{t.label}
          </button>
        ))}
        <button
          onClick={logout}
          className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-slate-500"
        >
          <LogOut className="h-5 w-5" />Sair
        </button>
      </nav>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg max-lg:bottom-24">
          <Check className="h-4 w-4" /> {toast}
        </div>
      )}
      {lightbox && <Lightbox foto={lightbox} onClose={() => setLightbox(null)} />}
      {cardRel && (
        <CardModal
          release={cardRel}
          prefeituraNome={data?.prefeitura?.nome ?? null}
          municipio={muni}
          cor={data?.contexto?.cor ?? null}
          logoUrl={data?.contexto?.logoUrl ?? null}
          onClose={() => setCardRel(null)}
          flash={flash}
        />
      )}
    </div>
  );
}

/* ---------------- Redesign: nav + Visão Geral ---------------- */
type RankItem = { sec: string; nome: string; total: number; publicado: number };

function DarkNav({ icon, label, active, badge, soon, onClick }: {
  icon: React.ReactNode; label: string; active?: boolean; badge?: number; soon?: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${active ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-white/5"}`}>
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {badge != null && badge > 0 && <span className={`rounded-full px-2 text-[11px] font-semibold tabular-nums ${active ? "bg-white/20 text-white" : "bg-white/10 text-slate-300"}`}>{badge}</span>}
      {soon && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-400">em breve</span>}
    </button>
  );
}

function FotoMini({ foto }: { foto?: Foto }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (foto?.url) return <img src={foto.url} alt="" className="h-9 w-12 shrink-0 rounded-md object-cover" />;
  return <div className="flex h-9 w-12 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-400"><ImageIcon className="h-4 w-4" /></div>;
}

function DonutSec({ ranking, total }: { ranking: RankItem[]; total: number }) {
  const CORES = ["#1e3a8a", "#2563eb", "#3b82f6", "#93c5fd", "#cbd5e1"];
  const top = ranking.slice(0, 4);
  const outras = ranking.slice(4).reduce((s, r) => s + r.total, 0);
  const segs = [
    ...top.map((r, i) => ({ label: r.sec, value: r.total, cor: CORES[i] })),
    ...(outras ? [{ label: "Outras", value: outras, cor: CORES[4] }] : []),
  ];
  const R = 54, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="flex items-center gap-6 max-sm:flex-col">
      <div className="relative h-36 w-36 shrink-0">
        <svg viewBox="0 0 140 140" className="h-36 w-36 -rotate-90">
          <circle cx="70" cy="70" r={R} fill="none" stroke="#eef2f7" strokeWidth="18" />
          {total > 0 && segs.map((s, i) => {
            const frac = s.value / total;
            const el = <circle key={i} cx="70" cy="70" r={R} fill="none" stroke={s.cor} strokeWidth="18" strokeLinecap="butt" strokeDasharray={`${frac * C} ${C}`} strokeDashoffset={-acc * C} />;
            acc += frac;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-2xl font-extrabold tabular-nums text-slate-900">{total}</div>
          <div className="text-[11px] text-slate-400">notícias</div>
        </div>
      </div>
      <div className="flex-1 space-y-2 max-sm:w-full">
        {segs.length === 0 && <div className="text-sm text-slate-400">Sem dados ainda.</div>}
        {segs.map((s, i) => (
          <div key={i} className="flex items-center gap-2.5 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.cor }} />
            <span className="flex-1 truncate text-slate-600">{s.label}</span>
            <span className="font-semibold tabular-nums text-slate-800">{s.value}</span>
            <span className="w-11 text-right text-xs text-slate-400">{total ? Math.round((s.value / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TarefaRow({ n, label, onClick }: { n: number; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-left hover:border-blue-300 hover:bg-blue-50/40">
      <span className="flex h-7 min-w-[28px] items-center justify-center rounded-lg bg-blue-600 px-1.5 text-xs font-bold text-white">{n}</span>
      <span className="flex-1 text-sm text-slate-700">{label}</span>
      <ChevronRight className="h-4 w-4 text-slate-400" />
    </button>
  );
}

function Stepper() {
  const steps = [
    { label: "Solicitação", sub: "Secretaria", done: true, icon: <Check className="h-4 w-4" /> },
    { label: "Produção", sub: "IA", done: true, icon: <Check className="h-4 w-4" /> },
    { label: "Aprovação", sub: "Secom", done: true, icon: <Check className="h-4 w-4" /> },
    { label: "Distribuição", sub: "Imprensa", done: false, icon: <Send className="h-4 w-4" /> },
    { label: "Clipagem", sub: "Resultado", done: false, icon: <BarChart3 className="h-4 w-4" /> },
  ];
  return (
    <div className="flex items-start justify-between">
      {steps.map((s, i) => (
        <div key={i} className="flex flex-1 flex-col items-center text-center">
          <div className="flex w-full items-center">
            <div className={`h-0.5 flex-1 ${i === 0 ? "opacity-0" : s.done ? "bg-emerald-400" : "bg-slate-200"}`} />
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${s.done ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400"}`}>{s.icon}</div>
            <div className={`h-0.5 flex-1 ${i === steps.length - 1 ? "opacity-0" : steps[i + 1].done ? "bg-emerald-400" : "bg-slate-200"}`} />
          </div>
          <div className="mt-2 text-xs font-semibold text-slate-700">{s.label}</div>
          <div className="text-[10px] text-slate-400">({s.sub})</div>
        </div>
      ))}
    </div>
  );
}

function VisaoGeral({ releases, ranking, go, openRelease }: {
  releases: Release[]; ranking: RankItem[];
  go: (v: Vista, f?: Status) => void; openRelease: (r: Release) => void;
}) {
  const c = (s: Status) => releases.filter((r) => r.status === s).length;
  const total = releases.filter((r) => r.status !== "aguardando").length;
  const ultimas = [...releases]
    .filter((r) => r.status !== "aguardando")
    .sort((a, b) => new Date(b.criadoEm ?? 0).getTime() - new Date(a.criadoEm ?? 0).getTime())
    .slice(0, 4);
  const kpis = [
    { label: "Notícias produzidas", value: total, hint: "Total no período", icon: <FileText className="h-5 w-5" /> },
    { label: "Aguardando análise", value: c("pendente") + c("aguardando"), hint: "Recém-chegados", icon: <Inbox className="h-5 w-5" /> },
    { label: "Aprovados", value: c("aprovado"), hint: "Prontos para publicar", icon: <Check className="h-5 w-5" /> },
    { label: "Publicados", value: c("publicado"), hint: "Já veiculados", icon: <Send className="h-5 w-5" /> },
  ];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">{k.icon}</div>
            <div className="text-3xl font-bold tabular-nums text-slate-900">{k.value}</div>
            <div className="mt-1 text-sm font-medium text-slate-600">{k.label}</div>
            <div className="text-xs text-slate-400">{k.hint}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-5 max-lg:grid-cols-1">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 flex items-center gap-2 text-base font-bold"><Bell className="h-4 w-4 text-blue-600" />Tarefas pendentes</h2>
          <div className="space-y-2">
            <TarefaRow n={c("pendente")} label="releases aguardando análise" onClick={() => go("fila", "pendente")} />
            <TarefaRow n={c("revisao")} label="conteúdos em revisão" onClick={() => go("fila", "revisao")} />
            <TarefaRow n={c("aprovado")} label="prontos para publicar" onClick={() => go("fila", "aprovado")} />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-base font-bold">Produção por secretaria</h2>
          <DonutSec ranking={ranking} total={total} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5 max-lg:grid-cols-1">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold">Últimas notícias</h2>
            <button onClick={() => go("fila", "publicado")} className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:text-blue-900">Ver todas <ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="space-y-1">
            {ultimas.length === 0 && <div className="py-6 text-center text-sm text-slate-400">Ainda não há notícias.</div>}
            {ultimas.map((r) => (
              <button key={r.id} onClick={() => openRelease(r)} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-slate-50">
                <FotoMini foto={r.fotos[0]} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-800">{r.headline ?? "—"}</div>
                  <div className="truncate text-[11px] text-slate-400">{r.secretaria}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS[r.status].badge}`}>{STATUS[r.status].label}</span>
                <span className="shrink-0 text-[11px] text-slate-400 max-sm:hidden">{timeAgo(r.criadoEm)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-base font-bold">Fluxo de produção</h2>
          <Stepper />
          <p className="mt-4 text-center text-[11px] text-slate-400">Distribuição e Clipagem chegam nas próximas fases.</p>
        </div>
      </div>
    </div>
  );
}

function EmBreve({ tipo }: { tipo: "distribuicao" | "clipagem" }) {
  const info = tipo === "distribuicao"
    ? { icon: <Send className="h-7 w-7" />, titulo: "Distribuição para a imprensa", texto: "Envie releases aprovados para o seu mailing de veículos e jornalistas e acompanhe cada envio — direto do painel." }
    : { icon: <Newspaper className="h-7 w-7" />, titulo: "Clipagem (monitoramento)", texto: "Acompanhe automaticamente onde suas notícias foram publicadas na imprensa, com veículo, data e alcance." };
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">{info.icon}</div>
      <h2 className="text-lg font-bold text-slate-900">{info.titulo}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">{info.texto}</p>
      <span className="mt-4 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-700">Em breve</span>
    </div>
  );
}

/* ---------------- Subcomponentes ---------------- */

function Kpi({ value, label, hint, bar }: { value: number | string; label: string; hint: string; bar: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4">
      <span className={`absolute left-0 top-0 h-full w-1 ${bar}`} />
      <div className="text-2xl font-bold tabular-nums leading-none">{value}</div>
      <div className="mt-1.5 text-xs text-slate-600">{label}</div>
      <div className="text-[11px] text-slate-400">{hint}</div>
    </div>
  );
}
function Kpis({ view, releases, secretarios, ranking }: {
  view: string; releases: Release[]; secretarios: Secretario[];
  ranking: { sec: string; nome: string; total: number; publicado: number }[];
}) {
  const c = (s: Status) => releases.filter((r) => r.status === s).length;
  let cards: React.ReactNode;
  if (view === "ranking") {
    const lider = ranking[0];
    cards = (<>
      <Kpi value={releases.length} label="Releases no mês" hint="Total recebido" bar="bg-blue-600" />
      <Kpi value={c("publicado")} label="Publicados no mês" hint="Já veiculados" bar="bg-slate-500" />
      <Kpi value={ranking.length} label="Secretarias ativas" hint="Enviaram ao menos 1" bar="bg-sky-500" />
      <Kpi value={lider ? lider.total : 0} label="Secretaria líder" hint={lider ? `${lider.sec} · ${lider.nome}` : "—"} bar="bg-emerald-500" />
    </>);
  } else if (view === "cadastro") {
    const ativos = secretarios.filter((s) => s.ativo).length;
    const areas = new Set(secretarios.filter((s) => s.ativo).map((s) => s.secretaria));
    cards = (<>
      <Kpi value={secretarios.length} label="Secretários cadastrados" hint="Reconhecidos pelo sistema" bar="bg-blue-600" />
      <Kpi value={ativos} label="Ativos" hint="Podem enviar agora" bar="bg-emerald-500" />
      <Kpi value={secretarios.length - ativos} label="Inativos" hint="Cadastro desativado" bar="bg-slate-500" />
      <Kpi value={areas.size} label="Secretarias cobertas" hint="Áreas com secretário ativo" bar="bg-sky-500" />
    </>);
  } else {
    cards = (<>
      <Kpi value={c("pendente") + c("aguardando")} label="Aguardando triagem" hint="Recém-chegados" bar="bg-amber-500" />
      <Kpi value={c("revisao")} label="Em revisão" hint="Sendo trabalhados" bar="bg-sky-500" />
      <Kpi value={c("aprovado")} label="Aprovados" hint="Prontos para publicar" bar="bg-emerald-500" />
      <Kpi value={c("publicado")} label="Publicados no mês" hint="Já veiculados" bar="bg-slate-500" />
    </>);
  }
  return <div className="grid grid-cols-4 gap-3 px-6 pt-4 max-lg:px-4 max-sm:grid-cols-2">{cards}</div>;
}

function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold ${color}`}>{children}</span>;
}

function Fila({ releases, filter, query, selId, setSelId, flash, reload, openFoto, openCard }: {
  releases: Release[]; filter: Status; query: string;
  selId: string | null; setSelId: (id: string | null) => void;
  flash: (m: string) => void; reload: () => Promise<void>; openFoto: (f: Foto) => void;
  openCard: (r: Release) => void;
}) {
  const q = query.toLowerCase();
  const list = releases
    .filter((r) => r.status === filter)
    .filter((r) => !q || `${r.secretarioNome} ${r.secretaria} ${r.headline}`.toLowerCase().includes(q));
  const sel = releases.find((r) => r.id === selId) ?? null;

  return (
    <div className="grid grid-cols-[minmax(300px,380px)_1fr] gap-5 max-lg:grid-cols-1">
      <div className={`flex flex-col gap-2.5 ${sel ? "max-lg:hidden" : ""}`}>
        {list.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">Nenhum release nesta fila.</div>}
        {list.map((r) => (
          <button
            key={r.id}
            onClick={() => setSelId(r.id)}
            className={`flex flex-col gap-2 rounded-xl border bg-white p-3.5 text-left transition ${selId === r.id ? "border-blue-600 ring-1 ring-blue-600" : "border-slate-200 hover:border-slate-300"}`}
          >
            <div className="flex items-center gap-2.5">
              <Avatar name={r.secretarioNome ?? "?"} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{r.secretarioNome}</div>
                <div className="truncate text-xs text-slate-500">{r.secretaria}</div>
              </div>
              <div className="text-[11px] text-slate-400">{timeAgo(r.criadoEm)}</div>
            </div>
            <div className={`line-clamp-2 text-[13px] ${r.aguardando ? "italic text-slate-500" : ""}`}>
              {r.aguardando ? "Foto recebida — aguardando o assunto do secretário" : r.headline}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS[r.status].badge}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${STATUS[r.status].dot}`} />{STATUS[r.status].label}
              </span>
              {r.aguardando && <Tag color="bg-amber-100 text-amber-800"><TriangleAlert className="h-3 w-3" />Aguardando</Tag>}
              {r.origem === "audio" && <Tag color="bg-slate-100 text-slate-600"><Mic className="h-3 w-3" />Áudio</Tag>}
              {r.fotos.length > 0 && <Tag color="bg-sky-100 text-sky-700"><ImageIcon className="h-3 w-3" />{r.fotos.length} {r.fotos.length > 1 ? "fotos" : "foto"}</Tag>}
              {r.flag && <Tag color="bg-amber-100 text-amber-800"><TriangleAlert className="h-3 w-3" />Revisar dados</Tag>}
              {r.status === "publicado" && r.publicadoEm && <Tag color="bg-emerald-100 text-emerald-800"><Check className="h-3 w-3" />{fmtDate(r.publicadoEm)}</Tag>}
            </div>
          </button>
        ))}
      </div>

      <div className={sel ? "" : "max-lg:hidden"}>
        {sel ? (
          <>
            <button
              onClick={() => setSelId(null)}
              className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold lg:hidden"
            >
              <ChevronLeft className="h-4 w-4" /> Voltar para a fila
            </button>
            <Detalhe key={sel.id} r={sel} flash={flash} reload={reload} openFoto={openFoto} openCard={openCard} />
          </>
        ) : (
          <div className="flex h-full min-h-[300px] items-center justify-center rounded-xl border border-slate-200 bg-white text-center text-sm text-slate-400">
            Selecione um release na fila<br />para revisar e publicar.
          </div>
        )}
      </div>
    </div>
  );
}

function Detalhe({ r, flash, reload, openFoto, openCard }: {
  r: Release; flash: (m: string) => void; reload: () => Promise<void>; openFoto: (f: Foto) => void;
  openCard: (r: Release) => void;
}) {
  const [headline, setHeadline] = useState(r.headline ?? "");
  const [release, setRelease] = useState(r.release ?? "");
  const [instagram, setInstagram] = useState(r.instagram ?? "");
  const [radio, setRadio] = useState(r.radio ?? "");
  const [busy, setBusy] = useState(false);
  const [genRadio, setGenRadio] = useState(false);
  const dirty =
    headline !== (r.headline ?? "") || release !== (r.release ?? "") ||
    instagram !== (r.instagram ?? "") || radio !== (r.radio ?? "");

  async function patch(body: Record<string, unknown>, msg: string) {
    setBusy(true);
    const res = await fetch(`/api/releases/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (res.ok) { flash(msg); await reload(); } else { flash("Erro ao salvar"); }
  }
  const copy = (t: string, label: string) => { navigator.clipboard?.writeText(t); flash(`${label} copiado`); };
  const baixarTxt = (texto: string, nome: string) => {
    const blob = new Blob([texto], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = nome; a.click();
    URL.revokeObjectURL(url);
  };
  const nPalavras = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
  async function gerarRadioAgora() {
    setGenRadio(true);
    try {
      const res = await fetch(`/api/releases/${r.id}/radio`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.radio) { setRadio(j.radio); flash("Texto de rádio gerado 📻"); await reload(); }
      else flash(j.error ?? "Não consegui gerar o texto de rádio.");
    } catch { flash("Não consegui gerar o texto de rádio."); }
    finally { setGenRadio(false); }
  }

  if (r.aguardando) {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-start gap-3 border-b border-slate-200 p-4">
          <Avatar name={r.secretarioNome ?? "?"} big />
          <div className="flex-1">
            <div className="font-bold">{r.secretarioNome}</div>
            <div className="text-xs text-slate-500">{r.secretaria} · {timeAgo(r.criadoEm)}</div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Aguardando assunto</span>
        </div>
        <div className="flex flex-col gap-4 p-5">
          <Fotos fotos={r.fotos} openFoto={openFoto} />
          <div>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Resposta automática ao secretário</div>
            <div className="rounded-2xl rounded-bl-sm border border-blue-200 bg-blue-50 px-4 py-3 text-sm">{r.askMsg}</div>
            <div className="mt-2.5 flex items-center gap-2 text-xs text-amber-700"><TriangleAlert className="h-3.5 w-3.5" />Aguardando o secretário responder com o assunto…</div>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-slate-200 p-4">
          <span className="mr-auto text-xs text-slate-500">{r.caso === "fora-janela" ? "Foto fora da janela de tempo" : "Foto sem contexto anterior"}</span>
          <button onClick={() => patch({}, "Pergunta reenviada")} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50"><Send className="h-4 w-4" />Reenviar pergunta</button>
          <button onClick={() => { if (confirm("Descartar esta foto?")) fetch(`/api/releases/${r.id}`, { method: "DELETE" }).then(() => { flash("Foto descartada"); reload(); }); }} className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"><Trash2 className="h-4 w-4" />Descartar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-start gap-3 border-b border-slate-200 p-4">
        <Avatar name={r.secretarioNome ?? "?"} big />
        <div className="flex-1">
          <div className="font-bold">{r.secretarioNome}</div>
          <div className="text-xs text-slate-500">
            {r.secretaria} · {timeAgo(r.criadoEm)}
            {r.publicadoEm && <> · Publicado em <b>{fmtDate(r.publicadoEm)}</b></>}
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS[r.status].badge}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS[r.status].dot}`} />{STATUS[r.status].label}
        </span>
      </div>

      <div className="flex flex-col gap-4 p-5">
        {r.flag && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            O áudio veio com poucos detalhes. A IA sinalizou trechos para confirmar com o secretário antes de publicar.
          </div>
        )}

        <div>
          <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <Mic className="h-3.5 w-3.5" />{r.origem === "texto" ? "Mensagem de texto" : "Transcrição do áudio"}
          </div>
          <div className="rounded-lg border border-l-4 border-slate-200 border-l-slate-400 bg-slate-50 px-3 py-2.5 text-sm italic text-slate-600">{r.transcricao}</div>
        </div>

        <Fotos fotos={r.fotos} openFoto={openFoto} linked />

        <Campo label="1. Headline" onCopy={() => copy(headline, "Headline")}>
          <input value={headline} onChange={(e) => setHeadline(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[15px] font-semibold outline-none focus:border-blue-600 focus:bg-white" />
        </Campo>
        <Campo label="2. Release para imprensa" onCopy={() => copy(release, "Release")}>
          <textarea value={release} onChange={(e) => setRelease(e.target.value)} rows={7} className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-blue-600 focus:bg-white" />
        </Campo>
        <Campo label="3. Post para Instagram" onCopy={() => copy(instagram, "Post")}>
          <textarea value={instagram} onChange={(e) => setInstagram(e.target.value)} rows={5} className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-blue-600 focus:bg-white" />
        </Campo>

        {/* 4. Texto para rádio */}
        <div>
          <div className="mb-1.5 flex items-center">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
              <Radio className="h-3.5 w-3.5" /><span className="text-blue-700">4.</span> Texto para rádio
            </span>
            {radio && (
              <div className="ml-auto flex gap-1.5">
                <button onClick={() => baixarTxt(radio, `radio-${(r.secretaria || "release").toLowerCase().replace(/\s+/g, "-")}.txt`)} className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-500 hover:text-blue-700"><Download className="h-3 w-3" />Baixar</button>
                <button onClick={() => copy(radio, "Texto de rádio")} className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-500 hover:text-blue-700"><Copy className="h-3 w-3" />Copiar</button>
              </div>
            )}
          </div>
          {radio ? (
            <>
              <textarea value={radio} onChange={(e) => setRadio(e.target.value)} rows={5} className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-blue-600 focus:bg-white" />
              <div className="mt-1 text-[11px] text-slate-400">
                {nPalavras(radio)} palavras · ideal 90–130 (40–60s de locução)
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center">
              <p className="mb-2 text-xs text-slate-500">Este release ainda não tem boletim de rádio.</p>
              <button onClick={gerarRadioAgora} disabled={genRadio} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
                {genRadio ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}Gerar texto de rádio
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 p-4">
        <button onClick={() => openCard(r)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" title="Gerar card para redes sociais"><ImageIcon className="h-4 w-4" />Gerar card</button>
        {dirty && <button onClick={() => patch({ headline, release, instagram, radio }, "Alterações salvas")} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-600 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Salvar edição</button>}
        <div className="ml-auto flex flex-wrap gap-2">
          {r.status === "pendente" && <Acao primary onClick={() => patch({ status: "revisao" }, "Em revisão")} icon={<Eye className="h-4 w-4" />}>Iniciar revisão</Acao>}
          {r.status === "revisao" && <Acao primary onClick={() => patch({ status: "aprovado" }, "Aprovado")} icon={<Check className="h-4 w-4" />}>Aprovar</Acao>}
          {r.status === "aprovado" && <>
            <Acao onClick={() => patch({ status: "revisao" }, "Voltar p/ revisão")} icon={<RotateCcw className="h-4 w-4" />}>Voltar</Acao>
            <Acao primary onClick={() => patch({ status: "publicado" }, "Publicado")} icon={<Send className="h-4 w-4" />}>Marcar como publicado</Acao>
          </>}
          {r.status === "publicado" && <Acao onClick={() => patch({ status: "revisao" }, "Reaberto")} icon={<RotateCcw className="h-4 w-4" />}>Reabrir</Acao>}
        </div>
      </div>
    </div>
  );
}

function Campo({ label, onCopy, children }: { label: string; onCopy: () => void; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400"><span className="text-blue-700">{label.split(".")[0]}.</span>{label.slice(label.indexOf(".") + 1)}</span>
        <button onClick={onCopy} className="ml-auto inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-500 hover:text-blue-700"><Copy className="h-3 w-3" />Copiar</button>
      </div>
      {children}
    </div>
  );
}
function Acao({ primary, onClick, icon, children }: { primary?: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold ${primary ? "bg-blue-700 text-white hover:bg-blue-800" : "border border-slate-300 hover:bg-slate-50"}`}>{icon}{children}</button>
  );
}

function Fotos({ fotos, openFoto, linked }: { fotos: Foto[]; openFoto: (f: Foto) => void; linked?: boolean }) {
  if (!fotos.length) return null;
  return (
    <div>
      <div className="mb-1.5 flex items-center">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Fotos enviadas pelo secretário</span>
        {linked && <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800"><Check className="h-3 w-3" />Vinculadas ao assunto</span>}
      </div>
      <div className="flex flex-wrap gap-2.5">
        {fotos.map((f) => (
          <button key={f.id} onClick={() => openFoto(f)} className="w-36 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 text-left hover:border-blue-600">
            <FotoImg foto={f} className="h-24 w-full" />
            <div className="px-2 py-1.5 text-[11px] font-medium text-slate-600">{f.legenda ?? "Foto"}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
function FotoImg({ foto, className }: { foto: Foto; className: string }) {
  if (foto.url) return <img src={foto.url} alt={foto.legenda ?? ""} className={`object-cover ${className}`} />;
  return (
    <div className={`flex flex-col items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300 text-slate-500 ${className}`}>
      <ImageIcon className="h-6 w-6" />
    </div>
  );
}
function Lightbox({ foto, onClose }: { foto: Foto; onClose: () => void }) {
  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg overflow-hidden rounded-2xl bg-white">
        <FotoImg foto={foto} className="max-h-[60vh] w-full" />
        <div className="flex items-center gap-3 p-4">
          <div className="flex-1 font-semibold">{foto.legenda ?? "Foto"}</div>
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">Fechar</button>
        </div>
      </div>
    </div>
  );
}

function Avatar({ name, big }: { name: string; big?: boolean }) {
  return <div className={`flex shrink-0 items-center justify-center rounded-lg bg-blue-50 font-bold text-blue-800 ${big ? "h-11 w-11 text-sm" : "h-8 w-8 text-xs"}`}>{initials(name)}</div>;
}

function Ranking({ ranking, muni }: { ranking: { sec: string; nome: string; total: number; publicado: number }[]; muni: string }) {
  const max = Math.max(1, ...ranking.map((r) => r.total));
  return (
    <div className="max-w-3xl rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold">Ranking por secretaria</h2>
          <p className="text-xs text-slate-500">{muni} · período atual</p>
        </div>
      </div>
      <div className="flex flex-col">
        {ranking.length === 0 && <div className="py-8 text-center text-sm text-slate-400">Ainda não há releases.</div>}
        {ranking.map((r, i) => (
          <div key={r.sec} className="flex items-center gap-3.5 border-b border-slate-100 py-3 last:border-0">
            <div className={`w-6 text-center text-[15px] font-bold tabular-nums ${i < 3 ? "text-blue-700" : "text-slate-400"}`}>{i + 1}</div>
            <Avatar name={r.nome || r.sec} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{r.sec}</div>
              <div className="mb-1.5 text-xs text-slate-500">{r.nome}</div>
              <div className="h-1.5 overflow-hidden rounded bg-slate-100"><div className="h-full rounded bg-blue-600" style={{ width: `${(r.total / max) * 100}%` }} /></div>
            </div>
            <div className="w-16 text-right">
              <div className="text-lg font-bold tabular-nums">{r.total}</div>
              <div className="text-[11px] text-slate-400">{r.publicado} publicados</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------- Cadastro ------- */
function Cadastro({ secretarios, query, flash, reload, goEquipe }: {
  secretarios: Secretario[]; query: string; flash: (m: string) => void; reload: () => Promise<void>; goEquipe: () => void;
}) {
  const [edit, setEdit] = useState<Secretario | null>(null);
  const [open, setOpen] = useState(false);
  const q = query.toLowerCase();
  const list = secretarios.filter((s) => !q || `${s.nome} ${s.secretaria} ${s.cargo} ${s.telefone}`.toLowerCase().includes(q));

  async function toggle(s: Secretario) {
    await fetch(`/api/secretarios/${s.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ativo: !s.ativo }) });
    flash(s.ativo ? "Cadastro desativado" : "Cadastro ativado");
    reload();
  }

  return (
    <div className="max-w-4xl rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold">Secretários cadastrados</h2>
          <p className="text-xs text-slate-500">{secretarios.length} cadastrados</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={goEquipe} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50" title="Equipe de comunicação"><BellRing className="h-4 w-4" />Equipe<ChevronRight className="h-4 w-4" /></button>
          <button onClick={() => { setEdit(null); setOpen(true); }} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-800"><Plus className="h-4 w-4" />Cadastrar secretário</button>
        </div>
      </div>
      <div className="mb-4 flex items-start gap-2 rounded-lg bg-blue-50 px-3.5 py-2.5 text-xs text-blue-800">
        <Phone className="mt-0.5 h-4 w-4 shrink-0" />
        É o <b>telefone cadastrado</b> que o sistema reconhece no WhatsApp. Se um secretário trocar de chip, atualize o número aqui.
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="pb-2 font-semibold">Secretário</th>
              <th className="pb-2 font-semibold">Secretaria</th>
              <th className="pb-2 font-semibold">Telefone (WhatsApp)</th>
              <th className="pb-2 font-semibold">Status</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id} className={`border-b border-slate-100 ${s.ativo ? "" : "opacity-60"}`}>
                <td className="py-2.5">
                  <div className="flex items-center gap-2.5"><Avatar name={s.nome} /><div><div className="font-semibold">{s.nome}</div><div className="text-xs text-slate-500">{s.cargo}</div></div></div>
                </td>
                <td><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium">{s.secretaria}</span></td>
                <td className="tabular-nums text-slate-700">{fmtTel(s.telefone)}</td>
                <td>
                  {s.ativo
                    ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Ativo</span>
                    : <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600"><span className="h-1.5 w-1.5 rounded-full bg-slate-500" />Inativo</span>}
                </td>
                <td>
                  <div className="flex justify-end gap-1.5">
                    <button onClick={() => { setEdit(s); setOpen(true); }} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:border-blue-600 hover:text-blue-700" title="Editar"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => toggle(s)} className={`rounded-lg border p-2 ${s.ativo ? "border-emerald-200 text-emerald-700" : "border-slate-200 text-slate-500"} hover:border-blue-600`} title="Ativar/Desativar"><Power className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-400">Nenhum secretário encontrado.</td></tr>}
          </tbody>
        </table>
      </div>
      {open && <SecretarioModal secretario={edit} onClose={() => setOpen(false)} flash={flash} reload={reload} />}
    </div>
  );
}

function SecretarioModal({ secretario, onClose, flash, reload }: {
  secretario: Secretario | null; onClose: () => void; flash: (m: string) => void; reload: () => Promise<void>;
}) {
  const [nome, setNome] = useState(secretario?.nome ?? "");
  const [cargo, setCargo] = useState(secretario?.cargo ?? "");
  const [secretaria, setSecretaria] = useState(secretario?.secretaria ?? "");
  const [telefone, setTelefone] = useState(secretario ? fmtTel(secretario.telefone) : "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const body = { nome, cargo, secretaria, telefone };
    const res = secretario
      ? await fetch(`/api/secretarios/${secretario.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      : await fetch(`/api/secretarios`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { flash(data.error ?? "Erro ao salvar"); return; }
    flash(secretario ? "Cadastro atualizado" : "Secretário cadastrado");
    onClose();
    reload();
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-5">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-2xl bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h3 className="font-bold">{secretario ? "Editar secretário" : "Cadastrar secretário"}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex flex-col gap-3 p-5">
          <Field label="Nome completo" value={nome} onChange={setNome} placeholder="Ex.: Marcos Ventura" />
          <Field label="Cargo" value={cargo} onChange={setCargo} placeholder="Ex.: Secretário de Obras" />
          <Field label="Secretaria" value={secretaria} onChange={setSecretaria} placeholder="Ex.: Obras" />
          <Field label="Telefone (WhatsApp)" value={telefone} onChange={setTelefone} placeholder="(47) 99999-9999" />
          <p className="text-xs text-slate-400">É esse número que o sistema reconhece no WhatsApp.</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 p-4">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Cancelar</button>
          <button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">{busy && <LoaderCircle className="h-4 w-4 animate-spin" />}Salvar cadastro</button>
        </div>
      </div>
    </div>
  );
}
function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20" />
    </label>
  );
}

/* ------- Equipe de comunicação ------- */
type Membro = { id: string; nome: string; email: string; ativo: boolean; aparelhos: number; eu: boolean };

function Equipe({ flash, goSecretarios, prefNome }: { flash: (m: string) => void; goSecretarios: () => void; prefNome: string | null }) {
  const [membros, setMembros] = useState<Membro[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/equipe", { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      setMembros(j.membros ?? []);
      setTotal(j.aparelhosTotal ?? 0);
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setOrigin(window.location.origin); }, []);

  // Link do app para enviar à equipe (aberto no celular → login → instalar → ativar).
  const appLink = `${origin}/app`;
  const convite =
    `Oi! Você entra para a equipe de comunicação${prefNome ? ` da ${prefNome}` : ""} no Porta Voz. 🎙️\n\n` +
    `Para receber no celular o aviso de cada release novo, siga estes passos:\n\n` +
    `1) Abra este link no celular: ${appLink}\n` +
    `2) Entre com o seu e-mail e senha\n` +
    `3) Instale o app: no menu do navegador, toque em "Adicionar à tela de início"\n` +
    `4) Abra o app pela tela de início e toque em "Ativar notificações"\n\n` +
    `Pronto! A partir daí cada release novo chega direto no seu celular. 📲`;

  function copiarLink() {
    navigator.clipboard?.writeText(appLink);
    flash("Link copiado");
  }
  function copiarConvite() {
    navigator.clipboard?.writeText(convite);
    flash("Convite com instruções copiado");
  }
  function enviarWhats() {
    window.open(`https://wa.me/?text=${encodeURIComponent(convite)}`, "_blank");
  }

  async function toggle(m: Membro) {
    const r = await fetch(`/api/equipe/${m.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ativo: !m.ativo }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { flash(j.error ?? "Não consegui alterar"); return; }
    flash(m.ativo ? "Acesso desativado" : "Acesso ativado");
    load();
  }
  async function remover(m: Membro) {
    if (!confirm(`Remover ${m.nome} da equipe? A pessoa perde o acesso ao painel.`)) return;
    const r = await fetch(`/api/equipe/${m.id}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { flash(j.error ?? "Não consegui remover"); return; }
    flash("Membro removido");
    load();
  }
  async function resetSenha(m: Membro) {
    const senha = prompt(`Nova senha para ${m.nome} (mínimo 6 caracteres):`);
    if (senha === null) return;
    const r = await fetch(`/api/equipe/${m.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senha }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { flash(j.error ?? "Não consegui redefinir"); return; }
    flash("Senha redefinida");
  }

  return (
    <div className="max-w-4xl rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Equipe de comunicação</h2>
          <p className="text-xs text-slate-500">{membros.length} {membros.length === 1 ? "membro" : "membros"} · {total} {total === 1 ? "aparelho" : "aparelhos"} com notificação ativa</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={goSecretarios} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" />Secretários</button>
          <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-800"><UserPlus className="h-4 w-4" />Cadastrar membro</button>
        </div>
      </div>

      <div className="mb-4 flex items-start gap-2 rounded-lg bg-blue-50 px-3.5 py-2.5 text-xs text-blue-800">
        <BellRing className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Cadastre quem revisa e publica os releases. Depois cada pessoa <b>entra no painel pelo celular, instala o app e toca em &ldquo;Ativar notificações&rdquo;</b> — a partir daí recebe o aviso de release novo. A coluna <b>Notificações</b> mostra quem já ativou.</span>
      </div>

      {/* Convite da equipe: link do app para enviar a quem vai instalar. */}
      <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Smartphone className="h-4 w-4 text-blue-700" />
          Link do app para a equipe
        </div>
        <p className="mb-3 mt-0.5 text-xs text-slate-500">Mande este link para quem vai receber as notificações. A pessoa abre no celular, faz login, instala o app e ativa as notificações.</p>
        <div className="flex items-center gap-2 max-sm:flex-col max-sm:items-stretch">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
            <Link2 className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="truncate text-sm text-slate-700">{origin ? appLink : "…"}</span>
          </div>
          <button onClick={copiarLink} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-white"><Copy className="h-4 w-4" />Copiar link</button>
          <button onClick={enviarWhats} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"><Send className="h-4 w-4" />Enviar no WhatsApp</button>
        </div>
        <button onClick={copiarConvite} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900"><Copy className="h-3.5 w-3.5" />Copiar convite com o passo a passo</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10 text-slate-400"><LoaderCircle className="h-5 w-5 animate-spin" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="pb-2 font-semibold">Membro</th>
                <th className="pb-2 font-semibold">Notificações</th>
                <th className="pb-2 font-semibold">Status</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {membros.map((m) => (
                <tr key={m.id} className={`border-b border-slate-100 ${m.ativo ? "" : "opacity-60"}`}>
                  <td className="py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={m.nome} />
                      <div>
                        <div className="font-semibold">{m.nome}{m.eu && <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">você</span>}</div>
                        <div className="flex items-center gap-1 text-xs text-slate-500"><Mail className="h-3 w-3" />{m.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {m.aparelhos > 0
                      ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800"><Smartphone className="h-3 w-3" />{m.aparelhos} {m.aparelhos === 1 ? "aparelho" : "aparelhos"}</span>
                      : <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500"><Smartphone className="h-3 w-3" />não ativou</span>}
                  </td>
                  <td>
                    {m.ativo
                      ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Ativo</span>
                      : <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600"><span className="h-1.5 w-1.5 rounded-full bg-slate-500" />Inativo</span>}
                  </td>
                  <td>
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => resetSenha(m)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:border-blue-600 hover:text-blue-700" title="Redefinir senha"><KeyRound className="h-4 w-4" /></button>
                      {!m.eu && <button onClick={() => toggle(m)} className={`rounded-lg border p-2 ${m.ativo ? "border-emerald-200 text-emerald-700" : "border-slate-200 text-slate-500"} hover:border-blue-600`} title="Ativar/Desativar acesso"><Power className="h-4 w-4" /></button>}
                      {!m.eu && <button onClick={() => remover(m)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:border-red-500 hover:text-red-600" title="Remover"><Trash2 className="h-4 w-4" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
              {membros.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-slate-400">Nenhum membro cadastrado ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {open && <MembroModal onClose={() => setOpen(false)} flash={flash} reload={load} />}
    </div>
  );
}

function MembroModal({ onClose, flash, reload }: {
  onClose: () => void; flash: (m: string) => void; reload: () => Promise<void>;
}) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const res = await fetch("/api/equipe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome, email, senha }) });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { flash(data.error ?? "Erro ao cadastrar"); return; }
    flash("Membro cadastrado — já pode entrar no painel");
    onClose();
    reload();
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-5">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-2xl bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h3 className="font-bold">Cadastrar membro da equipe</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex flex-col gap-3 p-5">
          <Field label="Nome completo" value={nome} onChange={setNome} placeholder="Ex.: Ana Ribeiro" />
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-600">E-mail (login)</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ana@prefeitura.sc.gov.br" className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-600">Senha provisória</span>
            <input type="text" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="mínimo 6 caracteres" className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20" />
          </label>
          <p className="text-xs text-slate-400">A pessoa entra com esse e-mail e senha, instala o app no celular e ativa as notificações. Depois ela pode trocar a senha com você.</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 p-4">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Cancelar</button>
          <button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">{busy && <LoaderCircle className="h-4 w-4 animate-spin" />}Cadastrar</button>
        </div>
      </div>
    </div>
  );
}

/* ------- Contexto (anamnese) ------- */
function ContextoView({ contexto, muni, uf, flash, reload }: {
  contexto: Contexto; muni: string; uf: string; flash: (m: string) => void; reload: () => Promise<void>;
}) {
  const [c, setC] = useState<NonNullable<Contexto>>({
    prefeito: "", vice: "", mandato: "", lema: "", programa: "", tom: "",
    hashtags: "", bairros: "", programas: "", contexto: "", modelos: [],
    cor: "", logoUrl: "",
    ...(contexto ?? {}),
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof NonNullable<Contexto>, v: string) => setC((p) => ({ ...p, [k]: v }));
  const modelos = c.modelos ?? [];

  function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 600 * 1024) { flash("Logo muito grande (máx. 600 KB). Use uma imagem menor."); e.target.value = ""; return; }
    const fr = new FileReader();
    fr.onload = () => setC((p) => ({ ...p, logoUrl: String(fr.result) }));
    fr.readAsDataURL(file);
    e.target.value = "";
  }

  async function save() {
    setBusy(true);
    const res = await fetch("/api/contexto", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });
    setBusy(false);
    if (res.ok) { flash("Contexto salvo — a IA já usa na próxima mensagem"); reload(); } else flash("Erro ao salvar");
  }

  return (
    <div className="max-w-4xl rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold">Contexto da cidade — {muni}</h2>
          <p className="text-xs text-slate-500">Anamnese da gestão · usada pela IA em cada release</p>
        </div>
        <button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Salvar contexto</button>
      </div>
      <Section>Identificação da gestão</Section>
      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <CField label="Prefeito(a)" value={c.prefeito ?? ""} onChange={(v) => set("prefeito", v)} />
        <CField label="Vice-prefeito(a)" value={c.vice ?? ""} onChange={(v) => set("vice", v)} />
        <CField label="Mandato" value={c.mandato ?? ""} onChange={(v) => set("mandato", v)} />
        <CField label="Lema / slogan da gestão" value={c.lema ?? ""} onChange={(v) => set("lema", v)} />
      </div>

      <Section>Identidade visual (usada nos cards de redes sociais)</Section>
      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">Cor da prefeitura</span>
          <div className="flex items-center gap-2">
            <input type="color" value={c.cor || "#1e6fd9"} onChange={(e) => set("cor", e.target.value)} className="h-10 w-14 cursor-pointer rounded border border-slate-300 bg-white p-1" />
            <input value={c.cor ?? ""} onChange={(e) => set("cor", e.target.value)} placeholder="#1e6fd9" className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600" />
          </div>
          <span className="text-[11px] text-slate-400">Cor do logo e da faixa no card.</span>
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">Logo da prefeitura</span>
          <div className="flex items-center gap-3">
            {c.logoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={c.logoUrl} alt="logo" className="h-12 w-12 rounded-lg border border-slate-200 bg-white object-contain p-1" />
              : <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-400"><ImageIcon className="h-5 w-5" /></div>}
            <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50">
              {c.logoUrl ? "Trocar" : "Enviar logo"}
              <input type="file" accept="image/*" className="hidden" onChange={onLogo} />
            </label>
            {c.logoUrl && <button onClick={() => set("logoUrl", "")} className="text-xs font-semibold text-red-600 hover:underline">Remover</button>}
          </div>
          <span className="text-[11px] text-slate-400">PNG com fundo transparente fica melhor. Máx. 600 KB.</span>
        </div>
      </div>

      <Section>Identidade de comunicação</Section>
      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <CField label="Plano de governo / programa" value={c.programa ?? ""} onChange={(v) => set("programa", v)} />
        <CField label="Tom de comunicação" value={c.tom ?? ""} onChange={(v) => set("tom", v)} />
        <CField label="Hashtags oficiais" value={c.hashtags ?? ""} onChange={(v) => set("hashtags", v)} />
      </div>

      <Section>Território e programas</Section>
      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <CArea label="Bairros e localidades" value={c.bairros ?? ""} onChange={(v) => set("bairros", v)} rows={5} />
        <CArea label="Programas e projetos da gestão" value={c.programas ?? ""} onChange={(v) => set("programas", v)} rows={5} />
      </div>

      <Section>Contexto livre</Section>
      <CArea label="O que mais a IA precisa saber sobre o município e a gestão" value={c.contexto ?? ""} onChange={(v) => set("contexto", v)} rows={4} />

      <Section>Modelos de release — como vocês escrevem hoje</Section>
      <p className="mb-2 flex items-start gap-2 text-xs text-slate-500"><FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />Cole releases <b>reais já publicados</b>. A IA usa como referência de estilo. O ideal são pelo menos 5.</p>
      <div className="flex flex-col gap-2.5">
        {modelos.map((m, i) => (
          <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wide text-blue-700">Modelo {i + 1}</span>
              <button onClick={() => setC((p) => ({ ...p, modelos: (p.modelos ?? []).filter((_, j) => j !== i) }))} className="rounded border border-slate-200 p-1.5 text-slate-500 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            <textarea value={m} onChange={(e) => setC((p) => ({ ...p, modelos: (p.modelos ?? []).map((x, j) => (j === i ? e.target.value : x)) }))} rows={4} placeholder="Cole aqui um release já publicado…" className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-600" />
          </div>
        ))}
      </div>
      <button onClick={() => setC((p) => ({ ...p, modelos: [...(p.modelos ?? []), ""] }))} className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50"><Plus className="h-4 w-4" />Adicionar modelo</button>

      <div className="mt-6 overflow-hidden rounded-xl border border-blue-600 bg-blue-50">
        <div className="flex items-center gap-2 border-b border-blue-600 px-4 py-2.5 text-xs font-bold text-blue-800"><Eye className="h-4 w-4" />Prévia — como a IA vai entender sua cidade</div>
        <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-[13px] leading-relaxed text-slate-700">{composeContext(c, muni, uf)}</pre>
      </div>
    </div>
  );
}
function Section({ children }: { children: React.ReactNode }) {
  return <div className="mb-2.5 mt-5 border-b border-slate-200 pb-1.5 text-[11px] font-bold uppercase tracking-wide text-blue-700">{children}</div>;
}
function CField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20" />
    </label>
  );
}
function CArea({ label, value, onChange, rows }: { label: string; value: string; onChange: (v: string) => void; rows: number }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className="resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20" />
    </label>
  );
}
