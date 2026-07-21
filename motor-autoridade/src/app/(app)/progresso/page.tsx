import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { computeProgress } from "@/lib/progress/compute";
import { Card } from "@/components/ui";

const FORMAT_LABEL: Record<string, string> = {
  video: "Vídeo",
  carousel: "Carrossel",
  post: "Post",
  story: "Story",
  linkedin: "LinkedIn",
};

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink-900">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-ink-500">{hint}</p> : null}
    </Card>
  );
}

export default async function ProgressoPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const p = await computeProgress(supabase, user.id);

  const goalPct = p.target > 0 ? Math.min(100, Math.round((p.publishedCount / p.target) * 100)) : 0;

  return (
    <main className="px-5 pt-8">
      <h1 className="mb-1 font-serif text-3xl text-ink-900">Progresso</h1>
      <p className="mb-5 text-sm text-ink-500">Sua presença — a métrica que importa é publicar.</p>

      <Card className="mb-5">
        <div className="flex items-baseline justify-between">
          <p className="text-xs uppercase tracking-wide text-ink-400">Meta da semana</p>
          <p className="text-ink-900">
            <span className="text-2xl font-semibold">{p.publishedCount}</span>
            <span className="text-ink-500"> / {p.target} publicados</span>
          </p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-sand-200">
          <div className="h-full rounded-full bg-brand-700" style={{ width: `${goalPct}%` }} />
        </div>
        {p.deltaVsPrev !== 0 ? (
          <p className="mt-3 text-sm text-brand-700">
            {p.deltaVsPrev > 0 ? "▲" : "▼"} {Math.abs(p.deltaVsPrev)}% vs. a semana anterior (
            {p.publishedPrev} publicados)
          </p>
        ) : null}
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Entregues" value={String(p.deliveredCount)} hint="oportunidades na semana" />
        <Stat label="Abertos" value={String(p.readCount)} />
        <Stat label="Produzidos" value={String(p.producedCount)} />
        <Stat
          label="Taxa de execução"
          value={`${Math.round(p.executionRate * 100)}%`}
          hint="publicados ÷ entregues"
        />
        <Stat label="Sequência atual" value={`${p.currentStreak} sem`} hint="semanas seguidas" />
        <Stat label="Melhor sequência" value={`${p.bestStreak} sem`} />
      </div>

      {p.preferredFormat ? (
        <Card className="mt-3">
          <p className="text-xs uppercase tracking-wide text-ink-400">Formato preferido</p>
          <p className="mt-1 text-ink-900">
            {FORMAT_LABEL[p.preferredFormat] ?? p.preferredFormat}
          </p>
        </Card>
      ) : null}

      <Link href="/relatorio" className="mt-5 block">
        <Card className="flex items-center justify-between">
          <span className="text-ink-900">Relatório semanal</span>
          <span className="text-brand-700">→</span>
        </Card>
      </Link>
    </main>
  );
}
