import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { startContent } from "../../hoje/actions";

const FORMATS = [
  { key: "video", emoji: "🎬", label: "Vídeo", desc: "Maior conexão com sua audiência", min: 5 },
  { key: "carousel", emoji: "🖼️", label: "Carrossel", desc: "Melhor para ensinar passo a passo", min: 8 },
  { key: "post", emoji: "✍️", label: "Post", desc: "Rápido e objetivo", min: 3 },
  { key: "story", emoji: "📱", label: "Story", desc: "Presença leve no dia a dia", min: 2 },
  { key: "linkedin", emoji: "💼", label: "LinkedIn", desc: "Aprofundamento profissional", min: 10 },
] as const;

/**
 * Escolha de formato (tela 09 do MVP): a partir de uma oportunidade, o cliente
 * decide como quer se comunicar. Cada opção inicia o conteúdo naquele formato.
 */
export default async function EscolhaFormatoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const supabase = await createClient();

  const { data: opp } = await supabase
    .from("daily_opportunities")
    .select("id, recommended_format")
    .eq("id", id)
    .maybeSingle();
  if (!opp) notFound();

  return (
    <main className="px-5 pt-8">
      <Link href="/hoje" className="text-sm text-ink-500">
        ← Voltar
      </Link>
      <h1 className="mt-3 font-serif text-3xl leading-tight text-ink-900">
        Como você quer se comunicar hoje?
      </h1>
      <p className="mt-2 text-[15px] text-ink-500">
        Todo formato mantém sua presença. Escolha o que cabe no seu dia.
      </p>

      <div className="mt-5 space-y-3">
        {FORMATS.map((f) => {
          const recommended = f.key === opp.recommended_format;
          return (
            <form key={f.key} action={startContent}>
              <input type="hidden" name="opportunity_id" value={opp.id} />
              <input type="hidden" name="format" value={f.key} />
              <button
                type="submit"
                className={`flex w-full items-center gap-4 rounded-[24px] bg-white p-4 text-left ring-1 transition hover:ring-brand-700 ${
                  recommended ? "ring-2 ring-brand-700 bg-success-100/40" : "ring-sand-200"
                }`}
              >
                <span className="text-2xl">{f.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink-900">{f.label}</span>
                  <span className="block text-sm text-ink-500">{f.desc}</span>
                </span>
                <span className="shrink-0 text-sm text-ink-400">{f.min} min</span>
              </button>
            </form>
          );
        })}
      </div>
    </main>
  );
}
