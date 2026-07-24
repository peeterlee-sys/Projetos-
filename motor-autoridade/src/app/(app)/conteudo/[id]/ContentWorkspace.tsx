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

export type Brand = {
  primary: string;
  secondary: string;
  accent: string;
  logoUrl: string | null;
};

type Props = {
  itemId: string;
  title: string;
  theme: string | null;
  status: string;
  generated: Record<string, unknown>;
  brand: Brand;
};

export function ContentWorkspace({ itemId, title, theme, status, generated, brand }: Props) {
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
        <p className="text-xs font-semibold uppercase tracking-wider text-gold-700">
          {active === "video" && generated.video
            ? `Roteiro · Vídeo de ${String(
                (generated.video as Record<string, unknown>).duration_sec ?? 60
              )}s`
            : theme ?? FORMAT_LABEL[active]}
        </p>
        <h1 className="mt-1 font-serif text-3xl leading-tight text-ink-900">{title}</h1>
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
        <FormatView format={active} payload={payload} brand={brand} />
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
          <Link
            href={`/teleprompter/${itemId}`}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-ink-900 px-5 py-4 text-[15px] font-medium text-sand-50 transition hover:bg-black active:scale-[0.98]"
          >
            ● Gravar com teleprompter
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

/** Lâmina visual do carrossel, pintada com a marca do cliente. */
function CarouselSlide({
  brand,
  index,
  total,
  eyebrow,
  headline,
  phrase,
  cover,
}: {
  brand: Brand;
  index: number;
  total: number;
  eyebrow?: string;
  headline?: string;
  phrase?: string;
  cover?: boolean;
}) {
  // Capa: fundo na cor principal, texto claro. Lâminas: fundo claro, texto na
  // cor principal. Em ambos, a barra e detalhes usam a cor de destaque.
  const bg = cover ? brand.primary : brand.secondary;
  const fg = cover ? brand.secondary : brand.primary;
  return (
    <div
      className="relative flex aspect-[4/5] w-full shrink-0 snap-center flex-col justify-between overflow-hidden rounded-2xl p-5"
      style={{ backgroundColor: bg, color: fg, width: "78%" }}
    >
      <div className="flex items-center justify-between">
        <div className="h-1.5 w-10 rounded-full" style={{ backgroundColor: brand.accent }} />
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ opacity: 0.6 }}>
          {cover ? (eyebrow ?? "") : `${index}/${total}`}
        </span>
      </div>

      <div className="py-2">
        {headline ? (
          <p className="font-serif text-2xl leading-tight" style={{ color: fg }}>
            {headline}
          </p>
        ) : null}
        {phrase ? (
          <p className="mt-2 text-sm leading-relaxed" style={{ color: fg, opacity: 0.85 }}>
            {phrase}
          </p>
        ) : null}
      </div>

      <div className="flex items-end justify-between">
        <span className="text-[11px]" style={{ opacity: 0.5 }}>
          {cover ? "arraste →" : ""}
        </span>
        {brand.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.logoUrl} alt="" className="h-6 w-auto max-w-[38%] object-contain" />
        ) : null}
      </div>
    </div>
  );
}

/** Renderiza o payload conforme o formato. */
function FormatView({
  format,
  payload,
  brand,
}: {
  format: FormatType;
  payload: unknown;
  brand: Brand;
}) {
  const p = payload as Record<string, unknown>;
  const Field = ({ label, value }: { label: string; value?: unknown }) =>
    value ? (
      <div>
        <p className="text-xs uppercase tracking-wide text-ink-400">{label}</p>
        <p className="mt-0.5 whitespace-pre-wrap text-ink-900">{String(value)}</p>
      </div>
    ) : null;

  // Vídeo tem layout próprio (estilo MVP): seções do roteiro com faixa de tempo.
  if (format === "video") {
    const duration = Number(p.duration_sec ?? 60);
    const hookEnd = Math.min(8, duration);
    const bodyEnd = Math.max(hookEnd, duration - 10);
    const sections = [
      { label: `Gancho · 0–${hookEnd}s`, text: p.hook },
      { label: `Desenvolvimento · ${hookEnd}–${bodyEnd}s`, text: p.body },
      { label: `Chamada · ${bodyEnd}–${duration}s`, text: p.cta },
    ].filter((s) => Boolean(s.text));

    return (
      <div className="space-y-3">
        {sections.map((s) => (
          <div key={s.label} className="rounded-[24px] bg-white p-5 ring-1 ring-sand-200">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">
              {s.label}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-[17px] leading-relaxed text-ink-900">
              {String(s.text)}
            </p>
          </div>
        ))}
        {(p.caption || p.cover_text || p.recording_tips) ? (
          <div className="space-y-4 rounded-[24px] bg-white p-5 ring-1 ring-sand-200">
            <Field label="Texto de capa" value={p.cover_text} />
            <Field label="Legenda para publicar" value={p.caption} />
            <Field label="Orientação de gravação" value={p.recording_tips} />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <Card className="space-y-4">
      {format === "carousel" &&
        (() => {
          const slides = Array.isArray(p.slides)
            ? (p.slides as Array<Record<string, unknown>>)
            : [];
          const total = slides.length + 1; // +1 pela capa
          return (
            <>
              {/* Prévia visual: rola horizontal, cada lâmina com a marca */}
              <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2">
                <CarouselSlide
                  brand={brand}
                  index={1}
                  total={total}
                  cover
                  eyebrow={p.cover ? "Carrossel" : undefined}
                  headline={String(p.cover ?? "")}
                />
                {slides.map((s, i) => (
                  <CarouselSlide
                    key={i}
                    brand={brand}
                    index={i + 2}
                    total={total}
                    headline={String(s.headline ?? "")}
                    phrase={String(s.phrase ?? "")}
                  />
                ))}
              </div>
              <p className="text-center text-xs text-ink-400">
                Prévia com a sua marca · ajuste as cores e o logo no Perfil
              </p>
              <Field label="Texto final" value={p.final_text} />
              <Field label="CTA" value={p.cta} />
              <Field label="Legenda" value={p.caption} />
            </>
          );
        })()}
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
