"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { FORMATS, type FormatType } from "@/lib/ai/schemas";
import { generateFormatAction, markPublishedAction } from "./actions";

const FORMAT_LABEL: Record<FormatType, string> = {
  video: "Vídeo",
  carousel: "Carrossel",
  post: "Post",
  story: "Story",
  linkedin: "LinkedIn",
};

type Props = {
  itemId: string;
  title: string;
  theme: string | null;
  status: string;
  generated: Record<string, unknown>;
};

export function ContentWorkspace({ itemId, title, theme, status, generated }: Props) {
  const router = useRouter();
  const [active, setActive] = useState<FormatType>("video");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const payload = generated[active];

  function generateFormat() {
    setError(null);
    startTransition(async () => {
      const res = await generateFormatAction(itemId, active);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  function markPublished() {
    startTransition(async () => {
      await markPublishedAction(itemId);
      router.refresh();
    });
  }

  return (
    <main className="px-5 pt-8">
      <Link href="/hoje" className="text-sm text-ink-500">
        ← Hoje
      </Link>
      <header className="mb-5 mt-2">
        {theme ? <p className="text-xs uppercase tracking-wide text-gold-700">{theme}</p> : null}
        <h1 className="mt-1 font-serif text-2xl text-ink-900">{title}</h1>
        {status === "published" ? (
          <span className="mt-2 inline-block rounded-full bg-success-100 px-3 py-1 text-xs text-brand-700">
            Publicado ✓
          </span>
        ) : null}
      </header>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {FORMATS.map((f) => (
          <button
            key={f}
            onClick={() => setActive(f)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm transition ${
              active === f ? "bg-brand-700 text-sand-50" : "bg-sand-100 text-ink-700"
            }`}
          >
            {FORMAT_LABEL[f]}
            {generated[f] ? " ✓" : ""}
          </button>
        ))}
      </div>

      {payload ? (
        <FormatView format={active} payload={payload} />
      ) : (
        <Card className="text-center">
          <p className="text-sm text-ink-500">
            Gere a versão em {FORMAT_LABEL[active].toLowerCase()} deste tema — com a sua cara,
            no seu tom.
          </p>
        </Card>
      )}

      {error ? <p className="mt-3 text-sm text-danger-600">{error}</p> : null}

      <div className="mt-5 space-y-3">
        <Button full onClick={generateFormat} disabled={pending}>
          {pending ? "Gerando…" : payload ? "Gerar novamente" : "Gerar conteúdo"}
        </Button>
        {active === "video" && payload ? (
          <Link href={`/teleprompter/${itemId}`} className="block">
            <Button full variant="secondary">
              🎬 Gravar com teleprompter
            </Button>
          </Link>
        ) : null}
        {status !== "published" ? (
          <Button full variant="ghost" onClick={markPublished} disabled={pending}>
            Marcar como publicado
          </Button>
        ) : null}
      </div>
    </main>
  );
}

/** Renderiza o payload conforme o formato. */
function FormatView({ format, payload }: { format: FormatType; payload: unknown }) {
  const p = payload as Record<string, unknown>;
  const Field = ({ label, value }: { label: string; value?: unknown }) =>
    value ? (
      <div>
        <p className="text-xs uppercase tracking-wide text-ink-400">{label}</p>
        <p className="mt-0.5 whitespace-pre-wrap text-ink-900">{String(value)}</p>
      </div>
    ) : null;

  return (
    <Card className="space-y-4">
      {format === "video" && (
        <>
          <Field label="Título" value={p.title} />
          <Field label="Texto de capa" value={p.cover_text} />
          <Field label="Gancho" value={p.hook} />
          <Field label="Roteiro" value={p.body} />
          <Field label="Legenda" value={p.caption} />
          <Field label="CTA" value={p.cta} />
          <Field label="Orientação de gravação" value={p.recording_tips} />
        </>
      )}
      {format === "carousel" && (
        <>
          <Field label="Capa" value={p.cover} />
          {Array.isArray(p.slides) &&
            (p.slides as Array<Record<string, unknown>>).map((s, i) => (
              <div key={i} className="rounded-xl bg-sand-100 p-3">
                <p className="text-xs text-ink-400">Lâmina {i + 1}</p>
                <p className="font-medium text-ink-900">{String(s.headline ?? "")}</p>
                <p className="text-sm text-ink-700">{String(s.phrase ?? "")}</p>
              </div>
            ))}
          <Field label="Texto final" value={p.final_text} />
          <Field label="CTA" value={p.cta} />
          <Field label="Legenda" value={p.caption} />
        </>
      )}
      {format === "post" && (
        <>
          <Field label="Texto principal" value={p.main_text} />
          <Field label="Chamada visual" value={p.visual_call} />
          <Field label="Legenda" value={p.caption} />
          <Field label="CTA" value={p.cta} />
          <Field label="Sugestão de imagem" value={p.image_suggestion} />
        </>
      )}
      {format === "story" && (
        <>
          {Array.isArray(p.sequence) &&
            (p.sequence as Array<Record<string, unknown>>).map((s, i) => (
              <div key={i} className="rounded-xl bg-sand-100 p-3">
                <p className="text-xs text-ink-400">Quadro {i + 1}</p>
                <p className="text-ink-900">{String(s.text ?? "")}</p>
              </div>
            ))}
          {p.poll ? (
            <Field
              label="Enquete"
              value={`${(p.poll as Record<string, unknown>).question} — ${(
                (p.poll as Record<string, unknown>).options as string[]
              ).join(" / ")}`}
            />
          ) : null}
          <Field label="Caixa de pergunta" value={p.question_box} />
          <Field label="CTA" value={p.cta} />
        </>
      )}
      {format === "linkedin" && (
        <>
          <Field label="Título" value={p.title} />
          <Field label="Introdução" value={p.intro} />
          <Field label="Desenvolvimento" value={p.body} />
          <Field label="Conclusão" value={p.conclusion} />
          <Field label="CTA" value={p.cta} />
        </>
      )}
    </Card>
  );
}
