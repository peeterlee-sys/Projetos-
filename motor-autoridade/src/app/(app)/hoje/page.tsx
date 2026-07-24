import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { Button, Card } from "@/components/ui";
import { getStimulus } from "@/lib/behavior/detect";
import { startContent } from "./actions";

const FORMAT_LABEL: Record<string, string> = {
  video: "Vídeo",
  carousel: "Carrossel",
  post: "Post",
  story: "Story",
  linkedin: "LinkedIn",
};

const FORMAT_EMOJI: Record<string, string> = {
  video: "🎬",
  carousel: "🖼️",
  post: "✍️",
  story: "📱",
  linkedin: "💼",
};

function greeting(name: string | null) {
  const h = new Date().getHours();
  const period = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  return name ? `${period}, ${name.split(" ")[0]}.` : `${period}.`;
}

/** "Quarta-feira, 16 de julho" — data por extenso em pt-BR. */
function todayLabel(): string {
  const s = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function startOfWeek(): string {
  const d = new Date();
  const day = d.getDay(); // 0=domingo
  const diff = (day === 0 ? -6 : 1) - day; // segunda-feira
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export default async function HojePage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: prefs }, { data: goal }, { data: opportunity }] = await Promise.all([
    supabase.from("client_preferences").select("weekly_goal").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("weekly_goals")
      .select("target, published_count")
      .eq("user_id", user.id)
      .eq("week_start", startOfWeek())
      .maybeSingle(),
    supabase
      .from("daily_opportunities")
      .select(
        "id, title, theme, reason, editorial_angle, recommended_format, estimated_duration, relevance_score, status"
      )
      .eq("user_id", user.id)
      .eq("opportunity_date", new Date().toISOString().slice(0, 10))
      .order("relevance_score", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const target = goal?.target ?? prefs?.weekly_goal ?? 0;
  const published = goal?.published_count ?? 0;
  const remaining = Math.max(0, target - published);

  const { message: stimulus } = await getStimulus(supabase, user.id, target, Boolean(opportunity));

  const initial = (user.full_name ?? "?").trim().charAt(0).toUpperCase() || "?";

  const durationSec = opportunity?.estimated_duration ?? 60;
  const effortMin = Math.max(3, Math.ceil(durationSec / 60) + 4);
  const formatChip = opportunity
    ? `${FORMAT_EMOJI[opportunity.recommended_format] ?? "✨"} ${
        opportunity.recommended_format === "video"
          ? `Vídeo de ${durationSec}s`
          : FORMAT_LABEL[opportunity.recommended_format] ?? opportunity.recommended_format
      }`
    : null;

  return (
    <main className="px-5 pt-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-ink-500">{todayLabel()}</p>
          <h1 className="mt-1 font-serif text-4xl leading-tight text-ink-900">
            {greeting(user.full_name)}
          </h1>
        </div>
        <Link
          href="/perfil"
          className="mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-700 text-lg font-medium text-sand-50"
          aria-label="Perfil"
        >
          {initial}
        </Link>
      </header>

      {target > 0 ? (
        <Card className="mb-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-semibold text-ink-900">Meta da semana</p>
            <p className="text-sm text-ink-500">
              {published} de {target} publicados
            </p>
          </div>
          <div className="mt-3 flex gap-1.5">
            {Array.from({ length: Math.min(target, 10) }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full ${
                  i < published ? "bg-brand-700" : "bg-sand-200"
                }`}
              />
            ))}
          </div>
          <p className="mt-3 text-sm text-brand-700">
            {remaining === 0
              ? "Meta da semana fechada! 🎉"
              : `Falta${remaining === 1 ? "" : "m"} ${remaining} para fechar a semana. Você está no ritmo.`}
          </p>
        </Card>
      ) : null}

      {opportunity ? (
        <>
          <div className="overflow-hidden rounded-[28px] bg-white shadow-sm ring-1 ring-sand-200">
            <div className="bg-gradient-to-br from-brand-700 to-brand-900 p-5 pb-6">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-sand-50">
                  Em alta hoje
                </span>
                {opportunity.theme ? (
                  <span className="rounded-full bg-gold-500 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-900">
                    {opportunity.theme}
                  </span>
                ) : null}
              </div>
              <h2 className="mt-4 font-serif text-3xl leading-tight text-sand-50">
                {opportunity.title}
              </h2>
            </div>

            <div className="p-5">
              {opportunity.editorial_angle ? (
                <p className="text-[15px] leading-relaxed text-ink-700">
                  <span className="font-semibold text-ink-900">Seu ângulo:</span>{" "}
                  {opportunity.editorial_angle}
                </p>
              ) : null}
              {opportunity.reason ? (
                <p className="mt-3 text-[15px] leading-relaxed text-ink-700">
                  <span className="font-semibold text-ink-900">Por que agora:</span>{" "}
                  {opportunity.reason}
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                {formatChip ? (
                  <span className="rounded-xl bg-sand-100 px-3 py-2 text-sm text-ink-700">
                    {formatChip}
                  </span>
                ) : null}
                <span className="rounded-xl bg-sand-100 px-3 py-2 text-sm text-ink-700">
                  ⏱️ {effortMin} min do seu tempo
                </span>
              </div>

              <form action={startContent} className="mt-5 space-y-2">
                <input type="hidden" name="opportunity_id" value={opportunity.id} />
                <Button type="submit" full>
                  Começar conteúdo
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="submit"
                    className="rounded-full border border-sand-300 bg-white px-4 py-3 text-sm font-medium text-ink-900 transition hover:bg-sand-50 active:scale-[0.98]"
                  >
                    Escolher outro formato
                  </button>
                  <Link
                    href="/biblioteca"
                    className="rounded-full border border-sand-300 bg-white px-4 py-3 text-center text-sm font-medium text-ink-900 transition hover:bg-sand-50 active:scale-[0.98]"
                  >
                    Outras oportunidades
                  </Link>
                </div>
              </form>
            </div>
          </div>

          <details className="mt-5 pb-2 text-center">
            <summary className="cursor-pointer list-none text-sm font-medium text-gold-700">
              Hoje está difícil?
            </summary>
            <p className="mx-auto mt-2 max-w-sm text-sm text-ink-500">
              {stimulus} Nenhuma opção gera culpa — escolher um caminho mais leve
              também conta como presença.
            </p>
          </details>
        </>
      ) : (
        <>
          <div className="mb-5 rounded-2xl border border-gold-300 bg-white/60 px-4 py-3">
            <p className="text-sm text-ink-700">{stimulus}</p>
          </div>
          <Card className="text-center">
            <h2 className="font-serif text-xl text-ink-900">
              Seu radar está sendo calibrado.
            </h2>
            <p className="mt-2 text-sm text-ink-500">
              Assim que uma pauta à sua altura aparecer, ela chega aqui — com roteiro,
              legenda e um caminho leve até a publicação.
            </p>
          </Card>
        </>
      )}
    </main>
  );
}
