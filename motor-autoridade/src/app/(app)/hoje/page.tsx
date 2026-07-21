import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { Card, Button } from "@/components/ui";
import { getStimulus } from "@/lib/behavior/detect";
import { startContent } from "./actions";

const FORMAT_LABEL: Record<string, string> = {
  video: "Vídeo",
  carousel: "Carrossel",
  post: "Post",
  story: "Story",
  linkedin: "LinkedIn",
};

function greeting(name: string | null) {
  const h = new Date().getHours();
  const period = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  return name ? `${period}, ${name.split(" ")[0]}` : period;
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
      .select("id, title, theme, reason, recommended_format, estimated_duration, relevance_score, status")
      .eq("user_id", user.id)
      .eq("opportunity_date", new Date().toISOString().slice(0, 10))
      .order("relevance_score", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const target = goal?.target ?? prefs?.weekly_goal ?? 0;
  const published = goal?.published_count ?? 0;

  const { message: stimulus } = await getStimulus(supabase, user.id, target, Boolean(opportunity));

  return (
    <main className="px-5 pt-8">
      <header className="mb-6">
        <p className="text-sm text-ink-500">{greeting(user.full_name)}</p>
        <h1 className="mt-1 font-serif text-3xl text-ink-900">Hoje no seu radar</h1>
      </header>

      <div className="mb-5 rounded-2xl border border-gold-300 bg-white/60 px-4 py-3">
        <p className="text-sm text-ink-700">{stimulus}</p>
      </div>

      {target > 0 ? (
        <Card className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-400">Meta da semana</p>
            <p className="mt-0.5 text-ink-900">
              <span className="text-2xl font-semibold">{published}</span>
              <span className="text-ink-500"> / {target} publicados</span>
            </p>
          </div>
          <div className="text-right text-xs text-ink-400">
            Cada formato conta como
            <br />
            presença. Sem culpa.
          </div>
        </Card>
      ) : null}

      {opportunity ? (
        <Card>
          <p className="text-xs uppercase tracking-wide text-gold-700">{opportunity.theme}</p>
          <h2 className="mt-1 font-serif text-2xl text-ink-900">{opportunity.title}</h2>
          {opportunity.reason ? (
            <p className="mt-2 text-sm text-ink-700">{opportunity.reason}</p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-ink-500">
            <span className="rounded-full bg-sand-100 px-3 py-1">
              Formato: {FORMAT_LABEL[opportunity.recommended_format] ?? opportunity.recommended_format}
            </span>
            {opportunity.estimated_duration ? (
              <span className="rounded-full bg-sand-100 px-3 py-1">
                ~{Math.round(opportunity.estimated_duration / 60)} min
              </span>
            ) : null}
            {opportunity.relevance_score != null ? (
              <span className="rounded-full bg-sand-100 px-3 py-1">
                Relevância {Math.round(opportunity.relevance_score * 100)}%
              </span>
            ) : null}
          </div>
          <form action={startContent} className="mt-5">
            <input type="hidden" name="opportunity_id" value={opportunity.id} />
            <Button type="submit" full>
              Começar conteúdo
            </Button>
          </form>
          <p className="mt-3 text-center text-xs text-ink-400">
            Nenhuma opção gera culpa. Escolher um caminho mais leve também conta como presença.
          </p>
        </Card>
      ) : (
        <Card className="text-center">
          <h2 className="font-serif text-xl text-ink-900">
            Seu radar está sendo calibrado.
          </h2>
          <p className="mt-2 text-sm text-ink-500">
            Assim que uma pauta à sua altura aparecer, ela chega aqui — com roteiro,
            legenda e um caminho leve até a publicação.
          </p>
        </Card>
      )}
    </main>
  );
}
