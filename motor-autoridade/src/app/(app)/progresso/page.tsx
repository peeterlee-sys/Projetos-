import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { computeProgress } from "@/lib/progress/compute";

const FORMAT_LABEL: Record<string, string> = {
  video: "Vídeo",
  carousel: "Carrossel",
  post: "Post",
  story: "Story",
  linkedin: "LinkedIn",
};

export default async function ProgressoPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const p = await computeProgress(supabase, user.id);

  const maxWeek = Math.max(1, ...p.weeklySeries.map((w) => w.count));

  return (
    <main className="px-5 pt-8">
      <h1 className="mb-5 font-serif text-4xl text-ink-900">Seu ritmo</h1>

      {/* Blocos de destaque 2×2 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-[24px] bg-brand-700 p-5 text-sand-50">
          <p className="font-serif text-4xl">
            {p.publishedCount}/{p.target}
          </p>
          <p className="mt-1 text-sm text-sand-50/80">meta da semana</p>
        </div>
        <div className="rounded-[24px] bg-white p-5 ring-1 ring-sand-200">
          <p className="font-serif text-4xl text-ink-900">
            {Math.round(p.executionRate * 100)}%
          </p>
          <p className="mt-1 text-sm text-ink-500">taxa de execução</p>
        </div>
        <div className="rounded-[24px] bg-white p-5 ring-1 ring-sand-200">
          <p className="font-serif text-4xl text-ink-900">
            {p.currentStreak} sem
          </p>
          <p className="mt-1 text-sm text-ink-500">sequência atual</p>
        </div>
        <div className="rounded-[24px] bg-white p-5 ring-1 ring-sand-200">
          <p className="font-serif text-4xl text-ink-900">{p.bestStreak} sem</p>
          <p className="mt-1 text-sm text-ink-500">melhor sequência</p>
        </div>
      </div>

      {/* Evolução — publicações por semana */}
      <div className="mt-4 rounded-[24px] bg-white p-5 ring-1 ring-sand-200">
        <p className="font-semibold text-ink-900">
          Evolução — publicações por semana
        </p>
        <div className="mt-4 flex items-end justify-between gap-2">
          {p.weeklySeries.map((w) => (
            <div key={w.label} className="flex flex-1 flex-col items-center gap-1">
              <span
                className={`text-sm ${
                  w.current ? "font-semibold text-ink-900" : "text-ink-500"
                }`}
              >
                {w.count}
              </span>
              <div
                className={`w-full rounded-lg ${
                  w.current ? "bg-brand-700" : "bg-sand-200"
                }`}
                style={{
                  height: `${Math.max(10, Math.round((w.count / maxWeek) * 88))}px`,
                }}
              />
              <span
                className={`text-xs ${
                  w.current ? "font-semibold text-brand-700" : "text-ink-500"
                }`}
              >
                {w.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Resumo em linhas */}
      <div className="mt-4 space-y-3 rounded-[24px] bg-white p-5 ring-1 ring-sand-200">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-[15px] text-ink-500">Formato mais usado</span>
          <span className="font-semibold text-ink-900">
            {p.preferredFormat
              ? `${FORMAT_LABEL[p.preferredFormat] ?? p.preferredFormat}${
                  p.preferredFormatPct != null ? ` (${p.preferredFormatPct}%)` : ""
                }`
              : "—"}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-[15px] text-ink-500">Publicados no mês</span>
          <span className="font-semibold text-ink-900">{p.publishedMonth}</span>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-[15px] text-ink-500">
            Oportunidades entregues (semana)
          </span>
          <span className="font-semibold text-ink-900">{p.deliveredCount}</span>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-[15px] text-ink-500">Conteúdos criados (semana)</span>
          <span className="font-semibold text-ink-900">{p.producedCount}</span>
        </div>
      </div>

      {/* Relatório semanal */}
      <Link href="/relatorio" className="mt-4 block">
        <div className="rounded-[24px] bg-success-100 p-5">
          <p className="font-semibold text-brand-700">
            Relatório semanal disponível →
          </p>
          <p className="mt-1 text-sm text-ink-700">
            {p.deltaVsPrev > 0
              ? `Prévia: você publicou ${p.deltaVsPrev}% a mais que na semana passada.`
              : "Veja a análise completa da sua semana."}
          </p>
        </div>
      </Link>
    </main>
  );
}
