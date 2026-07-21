"use client";

import { useState, useTransition } from "react";
import { Button, Card, Field, Input, Textarea } from "@/components/ui";
import { submitOnboarding } from "./actions";
import type { OnboardingInput } from "@/lib/validation/onboarding";

const FORMAT_OPTIONS = [
  { value: "video", label: "Vídeo" },
  { value: "carousel", label: "Carrossel" },
  { value: "post", label: "Post" },
  { value: "story", label: "Story" },
  { value: "linkedin", label: "LinkedIn" },
] as const;

const DAY_OPTIONS = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
] as const;

const FOLLOWUP = [
  { value: "light", label: "Leve" },
  { value: "balanced", label: "Equilibrado" },
  { value: "intense", label: "Intenso" },
] as const;

type State = OnboardingInput & { full_name: string };

function Chips<T extends string | number>({
  options,
  selected,
  onToggle,
}: {
  options: readonly { value: T; label: string }[];
  selected: T[];
  onToggle: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = selected.includes(o.value);
        return (
          <button
            type="button"
            key={String(o.value)}
            onClick={() => onToggle(o.value)}
            className={`rounded-full px-4 py-2 text-sm transition ${
              active
                ? "bg-brand-700 text-sand-50"
                : "bg-sand-100 text-ink-700 hover:bg-sand-200"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const STEPS = ["Você", "Público", "Editorial", "Ritmo", "Motivação"];

export function OnboardingWizard({ defaultName }: { defaultName: string }) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [state, setState] = useState<State>({
    full_name: defaultName,
    display_name: "",
    profession: "",
    company: "",
    field_of_work: "",
    specialties: [],
    city: "",
    target_audience: "",
    audience_pains: "",
    goals: "",
    main_themes: [],
    forbidden_themes: [],
    tone_of_voice: "",
    channels: [],
    video_duration_sec: 60,
    preferred_formats: ["video"],
    weekly_goal: 3,
    preferred_days: [1, 3, 5],
    preferred_times: [],
    main_block: "",
    main_motivation: "",
    follow_up_level: "balanced",
  });

  const set = <K extends keyof State>(k: K, v: State[K]) =>
    setState((s) => ({ ...s, [k]: v }));

  const toggle = <K extends keyof State>(k: K, v: State[K] extends (infer U)[] ? U : never) =>
    setState((s) => {
      const arr = s[k] as unknown[];
      const has = arr.includes(v);
      return { ...s, [k]: has ? arr.filter((x) => x !== v) : [...arr, v] } as State;
    });

  const commaToArray = (v: string) =>
    v.split(",").map((x) => x.trim()).filter(Boolean);

  const isLast = step === STEPS.length - 1;

  function next() {
    setError(null);
    if (step === 0 && state.full_name.trim().length < 2) {
      setError("Como podemos te chamar?");
      return;
    }
    if (isLast) {
      startTransition(async () => {
        const res = await submitOnboarding(state);
        if (res && !res.ok) setError(res.error);
      });
      return;
    }
    setStep((s) => s + 1);
  }

  return (
    <div>
      <header className="mb-6">
        <p className="text-sm text-ink-500">
          Passo {step + 1} de {STEPS.length}
        </p>
        <h1 className="mt-1 font-serif text-2xl text-brand-700">{STEPS[step]}</h1>
        <div className="mt-3 flex gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-brand-700" : "bg-sand-200"}`}
            />
          ))}
        </div>
      </header>

      <Card className="space-y-4">
        {step === 0 && (
          <>
            <Field label="Seu nome">
              <Input value={state.full_name} onChange={(e) => set("full_name", e.target.value)} />
            </Field>
            <Field label="Nome profissional" hint="Como você assina publicamente (opcional).">
              <Input value={state.display_name} onChange={(e) => set("display_name", e.target.value)} />
            </Field>
            <Field label="Profissão">
              <Input value={state.profession} onChange={(e) => set("profession", e.target.value)} />
            </Field>
            <Field label="Empresa">
              <Input value={state.company} onChange={(e) => set("company", e.target.value)} />
            </Field>
            <Field label="Área de atuação">
              <Input value={state.field_of_work} onChange={(e) => set("field_of_work", e.target.value)} />
            </Field>
            <Field label="Especialidades" hint="Separe por vírgula.">
              <Input
                defaultValue={state.specialties.join(", ")}
                onChange={(e) => set("specialties", commaToArray(e.target.value))}
              />
            </Field>
            <Field label="Cidade">
              <Input value={state.city} onChange={(e) => set("city", e.target.value)} />
            </Field>
          </>
        )}

        {step === 1 && (
          <>
            <Field label="Público-alvo">
              <Textarea
                value={state.target_audience}
                onChange={(e) => set("target_audience", e.target.value)}
                placeholder="Quem você quer alcançar?"
              />
            </Field>
            <Field label="Dores do público">
              <Textarea
                value={state.audience_pains}
                onChange={(e) => set("audience_pains", e.target.value)}
                placeholder="O que tira o sono de quem você atende?"
              />
            </Field>
            <Field label="Canais utilizados" hint="Separe por vírgula (Instagram, LinkedIn…).">
              <Input
                defaultValue={state.channels.join(", ")}
                onChange={(e) => set("channels", commaToArray(e.target.value))}
              />
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <Field label="Objetivos">
              <Textarea value={state.goals} onChange={(e) => set("goals", e.target.value)} />
            </Field>
            <Field label="Temas principais" hint="Isso calibra o radar de pautas. Separe por vírgula.">
              <Input
                defaultValue={state.main_themes.join(", ")}
                onChange={(e) => set("main_themes", commaToArray(e.target.value))}
              />
            </Field>
            <Field label="Temas proibidos" hint="O que o radar nunca deve sugerir.">
              <Input
                defaultValue={state.forbidden_themes.join(", ")}
                onChange={(e) => set("forbidden_themes", commaToArray(e.target.value))}
              />
            </Field>
            <Field label="Tom de voz">
              <Input
                value={state.tone_of_voice}
                onChange={(e) => set("tone_of_voice", e.target.value)}
                placeholder="Próximo, técnico, provocador…"
              />
            </Field>
          </>
        )}

        {step === 3 && (
          <>
            <Field label="Formatos preferidos">
              <Chips
                options={FORMAT_OPTIONS}
                selected={state.preferred_formats}
                onToggle={(v) => toggle("preferred_formats", v as never)}
              />
            </Field>
            <Field label="Quantos conteúdos por semana?">
              <Input
                type="number"
                min={1}
                max={21}
                value={state.weekly_goal}
                onChange={(e) => set("weekly_goal", Number(e.target.value))}
              />
            </Field>
            <Field label="Duração dos vídeos (segundos)">
              <Input
                type="number"
                min={10}
                max={600}
                value={state.video_duration_sec}
                onChange={(e) => set("video_duration_sec", Number(e.target.value))}
              />
            </Field>
            <Field label="Dias preferidos">
              <Chips
                options={DAY_OPTIONS}
                selected={state.preferred_days}
                onToggle={(v) => toggle("preferred_days", v as never)}
              />
            </Field>
          </>
        )}

        {step === 4 && (
          <>
            <Field label="Maior bloqueio" hint="O que mais te trava na hora de publicar?">
              <Textarea value={state.main_block} onChange={(e) => set("main_block", e.target.value)} />
            </Field>
            <Field label="Motivação principal">
              <Textarea
                value={state.main_motivation}
                onChange={(e) => set("main_motivation", e.target.value)}
              />
            </Field>
            <Field label="Nível de acompanhamento">
              <Chips
                options={FOLLOWUP}
                selected={[state.follow_up_level]}
                onToggle={(v) => set("follow_up_level", v as State["follow_up_level"])}
              />
            </Field>
          </>
        )}

        {error ? <p className="text-sm text-danger-600">{error}</p> : null}
      </Card>

      <div className="mt-5 flex gap-3">
        {step > 0 ? (
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={pending}>
            Voltar
          </Button>
        ) : null}
        <Button full onClick={next} disabled={pending}>
          {pending ? "Salvando…" : isLast ? "Concluir" : "Continuar"}
        </Button>
      </div>
    </div>
  );
}
