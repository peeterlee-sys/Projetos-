import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { generateWeeklyReport } from "@/lib/reports/weekly";
import { Card } from "@/components/ui";

export default async function RelatorioPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const r = await generateWeeklyReport(supabase, {
    id: user.id,
    tenant_id: user.tenant_id,
    full_name: user.full_name,
  });

  const Line = ({ label, value }: { label: string; value: string | number }) => (
    <div className="flex items-center justify-between border-b border-sand-200 py-2 last:border-0">
      <span className="text-sm text-ink-500">{label}</span>
      <span className="font-medium text-ink-900">{value}</span>
    </div>
  );

  return (
    <main className="px-5 pt-8">
      <Link href="/progresso" className="text-sm text-ink-500">
        ← Progresso
      </Link>
      <h1 className="mb-1 mt-2 font-serif text-3xl text-ink-900">Relatório semanal</h1>
      <p className="mb-5 text-sm text-ink-500">Semana de {r.week_start}</p>

      {r.narrative ? (
        <Card className="mb-5">
          <p className="font-serif text-lg text-ink-900">{r.narrative}</p>
        </Card>
      ) : null}

      <Card className="mb-5">
        <Line label="Oportunidades recebidas" value={r.opportunities} />
        <Line label="Conteúdos abertos" value={r.read_count} />
        <Line label="Conteúdos produzidos" value={r.produced_count} />
        <Line label="Vídeos gravados" value={r.videos_recorded} />
        <Line label="Posts criados" value={r.posts_created} />
        <Line label="Publicados" value={r.published_count} />
        <Line
          label="Taxa de execução"
          value={`${Math.round((r.execution_rate ?? 0) * 100)}%`}
        />
      </Card>

      {r.achievement ? (
        <Card className="mb-3">
          <p className="text-xs uppercase tracking-wide text-gold-700">Conquista</p>
          <p className="mt-1 text-ink-900">{r.achievement}</p>
        </Card>
      ) : null}
      {r.attention_point ? (
        <Card className="mb-3">
          <p className="text-xs uppercase tracking-wide text-ink-400">Ponto de atenção</p>
          <p className="mt-1 text-ink-900">{r.attention_point}</p>
        </Card>
      ) : null}
      {r.recommendation ? (
        <Card className="mb-3">
          <p className="text-xs uppercase tracking-wide text-brand-700">Recomendação</p>
          <p className="mt-1 text-ink-900">{r.recommendation}</p>
        </Card>
      ) : null}
      {r.next_week_goal != null ? (
        <Card>
          <p className="text-xs uppercase tracking-wide text-ink-400">Meta da próxima semana</p>
          <p className="mt-1 text-ink-900">{r.next_week_goal} publicações</p>
        </Card>
      ) : null}
    </main>
  );
}
