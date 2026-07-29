import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { generateWeeklyReport } from "@/lib/reports/weekly";

function rangeLabel(weekStartIso: string): string {
  const start = new Date(weekStartIso + "T00:00:00Z");
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (d: Date, withMonth: boolean) =>
    new Intl.DateTimeFormat("pt-BR", {
      day: "numeric",
      month: withMonth ? "long" : undefined,
      timeZone: "UTC",
    }).format(d);
  return `${fmt(start, false)} a ${fmt(end, true)}`.toUpperCase();
}

function Stat({
  value,
  label,
  highlight,
}: {
  value: number;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-[24px] p-5 ${
        highlight ? "bg-brand-700 text-sand-50" : "bg-white text-ink-900 ring-1 ring-sand-200"
      }`}
    >
      <p className="font-serif text-4xl">{value}</p>
      <p className={`mt-1 text-sm ${highlight ? "text-sand-50/80" : "text-ink-500"}`}>{label}</p>
    </div>
  );
}

export default async function RelatorioPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const r = await generateWeeklyReport(supabase, {
    id: user.id,
    tenant_id: user.tenant_id,
    full_name: user.full_name,
  });

  const bullets = [
    r.achievement ? { icon: "▲", label: "Conquista", text: r.achievement } : null,
    r.attention_point ? { icon: "◑", label: "Ponto de atenção", text: r.attention_point } : null,
    r.recommendation ? { icon: "→", label: "Recomendação", text: r.recommendation } : null,
  ].filter(Boolean) as { icon: string; label: string; text: string }[];

  return (
    <main className="px-5 pt-8">
      <Link href="/progresso" className="text-sm text-ink-500">
        ← Progresso
      </Link>

      <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-gold-700">
        Relatório · {rangeLabel(r.week_start)}
      </p>
      {r.narrative ? (
        <h1 className="mt-1 font-serif text-3xl leading-tight text-ink-900">{r.narrative}</h1>
      ) : (
        <h1 className="mt-1 font-serif text-3xl leading-tight text-ink-900">
          Sua semana em números
        </h1>
      )}

      {/* Grade 2×2 */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <Stat value={r.opportunities} label="oportunidades recebidas" />
        <Stat value={r.read_count} label="conteúdos lidos" />
        <Stat value={r.produced_count} label="peças produzidas" />
        <Stat value={r.published_count} label="publicações" highlight />
      </div>

      <p className="mt-5 text-[15px] leading-relaxed text-ink-700">
        Sua taxa de execução foi de{" "}
        <span className="font-semibold text-ink-900">
          {Math.round((r.execution_rate ?? 0) * 100)}%
        </span>
        .
      </p>

      {/* Destaques */}
      {bullets.length ? (
        <div className="mt-5 space-y-4">
          {bullets.map((b) => (
            <div key={b.label} className="flex gap-3">
              <span className="mt-0.5 text-brand-700">{b.icon}</span>
              <p className="text-[15px] leading-relaxed text-ink-700">
                <span className="font-semibold text-ink-900">{b.label}:</span> {b.text}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {/* Meta da próxima semana */}
      {r.next_week_goal != null ? (
        <div className="mt-6 rounded-[24px] bg-success-100 p-5">
          <p className="text-[15px] text-ink-800">
            <span className="font-semibold">Meta da próxima semana:</span> chegar a{" "}
            {r.next_week_goal} publicações.
          </p>
        </div>
      ) : null}
    </main>
  );
}
