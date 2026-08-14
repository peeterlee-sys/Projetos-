"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Inbox, Users, FileText, BarChart3, LogOut, Check, Send, Eye,
  RotateCcw, Trash2, Plus, Phone, Image as ImageIcon, TriangleAlert, Search,
  X, Mic, Pencil, Power, LoaderCircle, Copy,
} from "lucide-react";

/* ---------------- Tipos ---------------- */
type Foto = { id: string; url: string | null; legenda: string | null };
type Status = "pendente" | "revisao" | "aprovado" | "publicado" | "aguardando";
type Release = {
  id: string; secretarioNome: string | null; secretaria: string | null;
  origem: string | null; transcricao: string | null;
  headline: string | null; release: string | null; instagram: string | null;
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
  const [view, setView] = useState<"fila" | "cadastro" | "contexto" | "ranking">("fila");
  const [filter, setFilter] = useState<Status>("pendente");
  const [selId, setSelId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<Foto | null>(null);

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

  const releases = data?.releases ?? [];
  const secretarios = data?.secretarios ?? [];
  const muni = data?.prefeitura?.municipio ?? "";
  const uf = data?.prefeitura?.uf ?? "SC";

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
    <div className="grid min-h-screen grid-cols-[260px_1fr] max-lg:grid-cols-1">
      {/* Sidebar */}
      <aside className="flex flex-col gap-1 border-r border-slate-200 bg-white p-4 max-lg:hidden">
        <div className="mb-4 flex items-center gap-3 px-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Porta Voz" className="h-10 w-10 rounded-xl" />
          <div className="min-w-0">
            <div className="truncate font-bold leading-tight">Porta Voz</div>
            <div className="truncate text-xs text-slate-500">{data?.prefeitura?.nome ?? "Comunicação"}</div>
          </div>
        </div>

        <SideLabel>Fila de trabalho</SideLabel>
        {FILTERS.map((f) => {
          const n = releases.filter((r) => r.status === f.key).length;
          const active = view === "fila" && filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => { setView("fila"); setFilter(f.key); setSelId(null); }}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm ${active ? "bg-blue-50 font-semibold text-blue-800" : "text-slate-600 hover:bg-slate-50"}`}
            >
              <span className={`h-2 w-2 rounded-full ${STATUS[f.key].dot}`} />
              <span className="flex-1">{f.label}</span>
              <span className="rounded-full bg-slate-100 px-2 text-xs font-semibold tabular-nums text-slate-500">{n}</span>
            </button>
          );
        })}

        <SideLabel>Cadastro</SideLabel>
        <NavItem icon={<Users className="h-4 w-4" />} active={view === "cadastro"} onClick={() => { setView("cadastro"); setSelId(null); }}>
          Secretários <span className="ml-auto rounded-full bg-slate-100 px-2 text-xs font-semibold text-slate-500">{secretarios.length}</span>
        </NavItem>
        <NavItem icon={<FileText className="h-4 w-4" />} active={view === "contexto"} onClick={() => setView("contexto")}>
          Contexto da cidade
        </NavItem>

        <SideLabel>Relatórios</SideLabel>
        <NavItem icon={<BarChart3 className="h-4 w-4" />} active={view === "ranking"} onClick={() => setView("ranking")}>
          Ranking por secretaria
        </NavItem>

        <div className="mt-auto pt-4">
          <button onClick={logout} className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-500 hover:text-slate-800">
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex flex-col">
        {/* Topbar */}
        <div className="flex items-end justify-between gap-4 px-6 pt-5 max-lg:px-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">{muni || data?.prefeitura?.nome}</h1>
            <p className="text-sm text-slate-500">
              {view === "fila" && "Releases enviados pelos secretários, prontos para revisar e publicar."}
              {view === "cadastro" && "Secretários reconhecidos pelo sistema no WhatsApp."}
              {view === "contexto" && "A anamnese do município — o que a IA usa para escrever no tom certo."}
              {view === "ranking" && "Quem mais divulga — base para o relatório mensal."}
            </p>
          </div>
          {(view === "fila" || view === "cadastro") && (
            <div className="relative max-sm:hidden">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar…"
                className="w-56 rounded-full border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
              />
            </div>
          )}
        </div>

        {/* KPIs */}
        {view !== "contexto" && (
          <Kpis view={view} releases={releases} secretarios={secretarios} ranking={ranking} />
        )}

        <div className="flex-1 p-6 max-lg:p-4">
          {view === "fila" && (
            <Fila
              releases={releases} filter={filter} query={query}
              selId={selId} setSelId={setSelId}
              flash={flash} reload={load} openFoto={setLightbox}
            />
          )}
          {view === "cadastro" && (
            <Cadastro secretarios={secretarios} query={query} flash={flash} reload={load} />
          )}
          {view === "contexto" && data?.contexto !== undefined && (
            <ContextoView contexto={data.contexto} muni={muni} uf={uf} flash={flash} reload={load} />
          )}
          {view === "ranking" && <Ranking ranking={ranking} muni={muni} />}
        </div>
      </main>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          <Check className="h-4 w-4" /> {toast}
        </div>
      )}
      {lightbox && <Lightbox foto={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

/* ---------------- Subcomponentes ---------------- */
function SideLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-2 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{children}</div>;
}
function NavItem({ icon, active, onClick, children }: { icon: React.ReactNode; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm ${active ? "bg-blue-50 font-semibold text-blue-800" : "text-slate-600 hover:bg-slate-50"}`}>
      {icon}<span className="flex flex-1 items-center">{children}</span>
    </button>
  );
}

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

function Fila({ releases, filter, query, selId, setSelId, flash, reload, openFoto }: {
  releases: Release[]; filter: Status; query: string;
  selId: string | null; setSelId: (id: string | null) => void;
  flash: (m: string) => void; reload: () => Promise<void>; openFoto: (f: Foto) => void;
}) {
  const q = query.toLowerCase();
  const list = releases
    .filter((r) => r.status === filter)
    .filter((r) => !q || `${r.secretarioNome} ${r.secretaria} ${r.headline}`.toLowerCase().includes(q));
  const sel = releases.find((r) => r.id === selId) ?? null;

  return (
    <div className="grid grid-cols-[minmax(300px,380px)_1fr] gap-5 max-lg:grid-cols-1">
      <div className="flex flex-col gap-2.5">
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

      <div className="max-lg:hidden">
        {sel ? <Detalhe key={sel.id} r={sel} flash={flash} reload={reload} openFoto={openFoto} /> : (
          <div className="flex h-full min-h-[300px] items-center justify-center rounded-xl border border-slate-200 bg-white text-center text-sm text-slate-400">
            Selecione um release na fila<br />para revisar e publicar.
          </div>
        )}
      </div>
    </div>
  );
}

function Detalhe({ r, flash, reload, openFoto }: {
  r: Release; flash: (m: string) => void; reload: () => Promise<void>; openFoto: (f: Foto) => void;
}) {
  const [headline, setHeadline] = useState(r.headline ?? "");
  const [release, setRelease] = useState(r.release ?? "");
  const [instagram, setInstagram] = useState(r.instagram ?? "");
  const [busy, setBusy] = useState(false);
  const dirty = headline !== (r.headline ?? "") || release !== (r.release ?? "") || instagram !== (r.instagram ?? "");

  async function patch(body: Record<string, unknown>, msg: string) {
    setBusy(true);
    const res = await fetch(`/api/releases/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (res.ok) { flash(msg); await reload(); } else { flash("Erro ao salvar"); }
  }
  const copy = (t: string, label: string) => { navigator.clipboard?.writeText(t); flash(`${label} copiado`); };

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
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 p-4">
        {dirty && <button onClick={() => patch({ headline, release, instagram }, "Alterações salvas")} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-600 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Salvar edição</button>}
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
function Cadastro({ secretarios, query, flash, reload }: {
  secretarios: Secretario[]; query: string; flash: (m: string) => void; reload: () => Promise<void>;
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
        <button onClick={() => { setEdit(null); setOpen(true); }} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-800"><Plus className="h-4 w-4" />Cadastrar secretário</button>
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

/* ------- Contexto (anamnese) ------- */
function ContextoView({ contexto, muni, uf, flash, reload }: {
  contexto: Contexto; muni: string; uf: string; flash: (m: string) => void; reload: () => Promise<void>;
}) {
  const [c, setC] = useState<NonNullable<Contexto>>({
    prefeito: "", vice: "", mandato: "", lema: "", programa: "", tom: "",
    hashtags: "", bairros: "", programas: "", contexto: "", modelos: [],
    ...(contexto ?? {}),
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof NonNullable<Contexto>, v: string) => setC((p) => ({ ...p, [k]: v }));
  const modelos = c.modelos ?? [];

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
      <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        Esta anamnese <b>substitui a antiga planilha</b>. É daqui que a IA aprende quem é a gestão, o tom e os programas.
      </div>

      <Section>Identificação da gestão</Section>
      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <CField label="Prefeito(a)" value={c.prefeito ?? ""} onChange={(v) => set("prefeito", v)} />
        <CField label="Vice-prefeito(a)" value={c.vice ?? ""} onChange={(v) => set("vice", v)} />
        <CField label="Mandato" value={c.mandato ?? ""} onChange={(v) => set("mandato", v)} />
        <CField label="Lema / slogan da gestão" value={c.lema ?? ""} onChange={(v) => set("lema", v)} />
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
