import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getEditRequests, type EditRequestStatus, type EditRequestView } from "@/lib/admin/edits";
import { zapcapConfigured } from "@/lib/zapcap/client";
import { RefreshButton } from "./RefreshButton";

const STATUS_STYLE: Record<EditRequestStatus, string> = {
  ready: "bg-success-100 text-brand-700",
  processing: "bg-gold-300/40 text-gold-700",
  pending: "bg-sand-200 text-ink-500",
  failed: "bg-danger-600/10 text-danger-700",
};
const STATUS_LABEL: Record<EditRequestStatus, string> = {
  ready: "Pronto",
  processing: "Processando",
  pending: "Na fila",
  failed: "Falhou",
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Tempo de espera em linguagem curta (12 min, 3 h, 2 d). */
function age(minutes: number | null): string {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h`;
  return `${Math.floor(minutes / 1440)} d`;
}

function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "alert" | "good";
}) {
  const color =
    tone === "alert" ? "text-danger-700" : tone === "good" ? "text-brand-700" : "text-ink-900";
  return (
    <div className="rounded-2xl bg-white/80 p-4 ring-1 ring-sand-200">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}

function Row({ r }: { r: EditRequestView }) {
  return (
    <tr className="border-t border-sand-200 align-top transition hover:bg-sand-100/60">
      <td className="whitespace-nowrap px-3 py-3">
        <Link href={`/admin/clientes/${r.userId}`} className="block">
          <span className="font-medium text-ink-900 hover:text-brand-700">
            {r.userName ?? r.userEmail ?? "—"}
          </span>
          {r.userEmail ? <span className="block text-xs text-ink-400">{r.userEmail}</span> : null}
        </Link>
      </td>
      <td className="max-w-[18rem] px-3 py-3">
        {r.contentItemId ? (
          <Link
            href={`/conteudo/${r.contentItemId}`}
            className="block truncate text-sm text-ink-700 hover:text-brand-700"
            title={r.contentTitle ?? ""}
          >
            {r.contentTitle ?? "conteúdo sem título"}
          </Link>
        ) : (
          <span className="text-sm text-ink-400">avulso</span>
        )}
      </td>
      <td className="px-3 py-3">
        <span className={`rounded-full px-2.5 py-0.5 text-xs ${STATUS_STYLE[r.status]}`}>
          {STATUS_LABEL[r.status]}
        </span>
        {r.stalled ? (
          <span className="mt-1 block text-[11px] text-danger-700">parado há {age(r.ageMinutes)}</span>
        ) : null}
        {r.error ? (
          <span className="mt-1 block max-w-[16rem] text-[11px] text-danger-700" title={r.error}>
            {r.error}
          </span>
        ) : null}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-sm text-ink-500 tabular-nums">
        {fmt(r.createdAt)}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-sm text-ink-500 tabular-nums">
        {r.status === "ready" || r.status === "failed" ? age(r.ageMinutes) : "—"}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-sm text-ink-500">
        {r.language}
        {r.templateId ? (
          <span className="block max-w-[10rem] truncate font-mono text-[11px] text-ink-400" title={r.templateId}>
            {r.templateId}
          </span>
        ) : null}
      </td>
      <td className="whitespace-nowrap px-3 py-3">
        {r.outputUrl ? (
          <a
            href={r.outputUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-brand-700/30 px-3 py-1.5 text-xs font-medium text-brand-700 transition hover:bg-brand-700/5"
          >
            Ver vídeo
          </a>
        ) : (
          <span className="text-xs text-ink-400">—</span>
        )}
      </td>
    </tr>
  );
}

export default async function AdminCaptions() {
  const supabase = await createClient();
  const o = await getEditRequests(supabase);
  const configured = zapcapConfigured();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl text-ink-900">Legendas</h1>
          <p className="mt-1 text-sm text-ink-500">
            Pedidos de vídeo legendado feitos pelos clientes depois de aprovarem a gravação.
          </p>
        </div>
        <RefreshButton disabled={!configured || o.processing === 0} />
      </div>

      {!configured ? (
        <div className="rounded-2xl bg-gold-300/15 p-5 text-sm text-gold-700 ring-1 ring-gold-300/50">
          <p className="font-medium">Edição de legenda desligada neste ambiente.</p>
          <p className="mt-1">
            Defina <code className="font-mono">ZAPCAP_API_KEY</code> e{" "}
            <code className="font-mono">ZAPCAP_TEMPLATE_ID</code> nas variáveis de ambiente e faça
            um novo deploy. Sem elas o botão não aparece para o cliente e nenhum pedido novo entra.
          </p>
        </div>
      ) : null}

      <section>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Pedidos" value={String(o.total)} hint="últimos 200" />
          <Stat label="Em processamento" value={String(o.processing)} />
          <Stat label="Prontos" value={String(o.ready)} tone="good" />
          <Stat
            label="Com falha"
            value={String(o.failed)}
            tone={o.failed > 0 ? "alert" : "neutral"}
          />
        </div>
        {o.stalled > 0 ? (
          <p className="mt-3 text-sm text-danger-700">
            {o.stalled} pedido{o.stalled > 1 ? "s" : ""} em processamento há mais de 15 min — o
            cliente provavelmente fechou a tela antes do render terminar. Use{" "}
            <span className="font-medium">Atualizar status</span> para fechar o que já ficou pronto.
          </p>
        ) : null}
      </section>

      <section>
        {o.requests.length === 0 ? (
          <div className="rounded-2xl bg-white/80 p-8 text-center text-sm text-ink-500 ring-1 ring-sand-200">
            Nenhum pedido de legenda ainda.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl bg-white/80 ring-1 ring-sand-200">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-ink-400">
                  <th className="px-3 py-3 font-medium">Cliente</th>
                  <th className="px-3 py-3 font-medium">Conteúdo</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Pedido em</th>
                  <th className="px-3 py-3 font-medium">Tempo</th>
                  <th className="px-3 py-3 font-medium">Idioma / template</th>
                  <th className="px-3 py-3 font-medium">Vídeo</th>
                </tr>
              </thead>
              <tbody>
                {o.requests.map((r) => (
                  <Row key={r.id} r={r} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-ink-400">
          O link do vídeo vem do ZapCap e pode expirar — baixe o arquivo se precisar guardar.
        </p>
      </section>
    </div>
  );
}
