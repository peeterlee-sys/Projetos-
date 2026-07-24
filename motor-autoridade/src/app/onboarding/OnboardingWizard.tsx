"use client";

import { useState, useTransition } from "react";
import { Button, Card, Field, Input, Textarea } from "@/components/ui";
import { submitOnboarding } from "./actions";
import type {
  InfluenceSourceInput,
  InspirationRefInput,
  OnboardingInput,
} from "@/lib/validation/onboarding";

const FORMAT_OPTIONS = [
  { value: "video", label: "Vídeo" },
  { value: "carousel", label: "Carrossel" },
  { value: "story", label: "Story" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "post", label: "Texto" },
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

const OBJECTIVE_OPTIONS = [
  "Autoridade",
  "Vender mais",
  "Captar clientes",
  "Engajar audiência",
  "Crescer nas redes sociais",
  "Posicionar marca",
  "Preparação política",
  "Educação",
  "Outro",
] as const;

const TONE_OPTIONS = [
  "Mais técnico",
  "Mais popular",
  "Mais sério",
  "Mais descontraído",
  "Mais institucional",
  "Mais inspirador",
  "Mais provocador",
  "Mais emocional",
  "Mais racional",
] as const;

const SEGMENT_OPTIONS = [
  { value: "advogados", label: "Advocacia" },
  { value: "medicos", label: "Medicina / Saúde" },
  { value: "politicos", label: "Política" },
  { value: "pastores", label: "Ministério / Igreja" },
  { value: "empresarios", label: "Empresas / Negócios" },
  { value: "corretores", label: "Mercado imobiliário" },
  { value: "arquitetos", label: "Arquitetura" },
  { value: "outro", label: "Outro" },
] as const;

const INFLUENCE_KINDS = [
  { value: "site", label: "Site" },
  { value: "blog", label: "Blog" },
  { value: "newsletter", label: "Newsletter" },
  { value: "podcast", label: "Podcast" },
  { value: "youtube", label: "YouTube" },
  { value: "instagram", label: "Instagram" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "journalist", label: "Jornalista" },
  { value: "expert", label: "Especialista" },
  { value: "author", label: "Autor(a)" },
] as const;

const REFERENCE_KINDS = [
  { value: "instagram", label: "Instagram" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "youtube", label: "YouTube" },
  { value: "site", label: "Site" },
  { value: "blog", label: "Blog" },
] as const;

const PRIORITY_OPTIONS = [
  { value: "high", label: "Alta" },
  { value: "medium", label: "Média" },
  { value: "low", label: "Baixa" },
] as const;

const FOLLOWUP = [
  { value: "light", label: "Leve" },
  { value: "balanced", label: "Equilibrado" },
  { value: "intense", label: "Intenso" },
] as const;

type State = OnboardingInput;

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

function YesNo({
  value,
  onChange,
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex gap-2">
      {[
        { v: true, label: "Sim" },
        { v: false, label: "Não" },
      ].map((o) => (
        <button
          type="button"
          key={o.label}
          onClick={() => onChange(o.v)}
          className={`rounded-full px-4 py-2 text-sm transition ${
            value === o.v
              ? "bg-brand-700 text-sand-50"
              : "bg-sand-100 text-ink-700 hover:bg-sand-200"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const selectBase =
  "w-full rounded-2xl border border-sand-300 bg-sand-50 px-4 py-3 text-ink-900 outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-700/20";

const STEPS = [
  "Identidade",
  "Objetivo",
  "Público",
  "Posicionamento",
  "Tom",
  "Produção",
  "Fontes",
  "Referências",
];

const STEP_HINTS = [
  "Quem é você",
  "Por que produzir conteúdo",
  "Quem você quer atingir",
  "Como quer ser reconhecido",
  "Como você se comunica",
  "Seu ritmo de produção",
  "O que você acompanha",
  "Quem inspira sua comunicação",
];

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
    state: "",
    years_experience: "",
    bio_summary: "",
    differentials: "",
    segment: "",
    objectives: [],
    objective_other: "",
    goals: "",
    target_audience: "",
    audience_age: "",
    audience_city: "",
    audience_class: "",
    audience_profession: "",
    audience_pains: "",
    audience_doubts: "",
    audience_objections: "",
    positioning_recognition: "",
    main_themes: [],
    forbidden_themes: [],
    core_values: "",
    desired_description: "",
    tone_profile: [],
    tone_of_voice: "",
    publish_days_per_week: 3,
    preferred_formats: ["video"],
    time_per_day: "",
    likes_video: null,
    records_alone: null,
    has_team: null,
    video_duration_sec: 60,
    weekly_goal: 3,
    preferred_days: [1, 3, 5],
    preferred_times: [],
    channels: [],
    influence_sources: [],
    blocked_sources: "",
    inspiration_refs: [],
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

  // ── Fontes de influência ──────────────────────────────────────────────────
  const addSource = () => {
    setState((s) => ({
      ...s,
      influence_sources: [
        ...s.influence_sources,
        { kind: "site", label: "", url: "", priority: "medium", is_blocked: false },
      ],
    }));
  };
  const updateSource = (i: number, patch: Partial<InfluenceSourceInput>) =>
    setState((s) => ({
      ...s,
      influence_sources: s.influence_sources.map((src, j) => (j === i ? { ...src, ...patch } : src)),
    }));
  const removeSource = (i: number) =>
    setState((s) => ({
      ...s,
      influence_sources: s.influence_sources.filter((_, j) => j !== i),
    }));

  // ── Referências de inspiração ─────────────────────────────────────────────
  const addRef = () => {
    setState((s) =>
      s.inspiration_refs.length >= 10
        ? s
        : { ...s, inspiration_refs: [...s.inspiration_refs, { kind: "instagram", url: "", name: "" }] }
    );
  };
  const updateRef = (i: number, patch: Partial<InspirationRefInput>) =>
    setState((s) => ({
      ...s,
      inspiration_refs: s.inspiration_refs.map((r, j) => (j === i ? { ...r, ...patch } : r)),
    }));
  const removeRef = (i: number) =>
    setState((s) => ({ ...s, inspiration_refs: s.inspiration_refs.filter((_, j) => j !== i) }));

  const isLast = step === STEPS.length - 1;

  function next() {
    setError(null);
    if (step === 0 && state.full_name.trim().length < 2) {
      setError("Como podemos te chamar?");
      return;
    }
    if (isLast) {
      startTransition(async () => {
        const res = await submitOnboarding({
          ...state,
          // Referências sem link não contam.
          inspiration_refs: state.inspiration_refs.filter((r) => r.url.trim()),
        });
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
          Passo {step + 1} de {STEPS.length} · {STEP_HINTS[step]}
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
            <Field label="Especialidade" hint="Separe por vírgula.">
              <Input
                defaultValue={state.specialties.join(", ")}
                onChange={(e) => set("specialties", commaToArray(e.target.value))}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cidade">
                <Input value={state.city} onChange={(e) => set("city", e.target.value)} />
              </Field>
              <Field label="Estado">
                <Input value={state.state} onChange={(e) => set("state", e.target.value)} placeholder="UF" />
              </Field>
            </div>
            <Field label="Área de atuação">
              <Input value={state.field_of_work} onChange={(e) => set("field_of_work", e.target.value)} />
            </Field>
            <Field label="Segmento" hint="Calibra o radar de fontes do seu mercado.">
              <select
                className={selectBase}
                value={state.segment}
                onChange={(e) => set("segment", e.target.value)}
              >
                <option value="">Selecione…</option>
                {SEGMENT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tempo de experiência">
              <Input
                value={state.years_experience}
                onChange={(e) => set("years_experience", e.target.value)}
                placeholder="Ex.: 12 anos"
              />
            </Field>
            <Field label="Sua história resumida" hint="Trajetória em poucas linhas — isso dá vida ao seu conteúdo.">
              <Textarea value={state.bio_summary} onChange={(e) => set("bio_summary", e.target.value)} />
            </Field>
            <Field label="Seus diferenciais" hint="O que só você entrega?">
              <Textarea value={state.differentials} onChange={(e) => set("differentials", e.target.value)} />
            </Field>
          </>
        )}

        {step === 1 && (
          <>
            <Field label="Por que você deseja produzir conteúdo?" hint="Escolha quantos quiser.">
              <Chips
                options={OBJECTIVE_OPTIONS.map((o) => ({ value: o, label: o }))}
                selected={state.objectives}
                onToggle={(v) => toggle("objectives", v as never)}
              />
            </Field>
            {state.objectives.includes("Outro") ? (
              <Field label="Conte mais sobre esse objetivo">
                <Input
                  value={state.objective_other}
                  onChange={(e) => set("objective_other", e.target.value)}
                />
              </Field>
            ) : null}
            <Field label="O que o sucesso significa para você?" hint="Opcional — em suas palavras.">
              <Textarea value={state.goals} onChange={(e) => set("goals", e.target.value)} />
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <Field label="Quem você deseja atingir?">
              <Textarea
                value={state.target_audience}
                onChange={(e) => set("target_audience", e.target.value)}
                placeholder="Descreva a pessoa que você quer alcançar."
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Idade">
                <Input
                  value={state.audience_age}
                  onChange={(e) => set("audience_age", e.target.value)}
                  placeholder="Ex.: 30–50"
                />
              </Field>
              <Field label="Cidade">
                <Input value={state.audience_city} onChange={(e) => set("audience_city", e.target.value)} />
              </Field>
              <Field label="Classe social">
                <Input value={state.audience_class} onChange={(e) => set("audience_class", e.target.value)} />
              </Field>
              <Field label="Profissão">
                <Input
                  value={state.audience_profession}
                  onChange={(e) => set("audience_profession", e.target.value)}
                />
              </Field>
            </div>
            <Field label="Principais dores">
              <Textarea
                value={state.audience_pains}
                onChange={(e) => set("audience_pains", e.target.value)}
                placeholder="O que tira o sono de quem você atende?"
              />
            </Field>
            <Field label="Principais dúvidas">
              <Textarea value={state.audience_doubts} onChange={(e) => set("audience_doubts", e.target.value)} />
            </Field>
            <Field label="Principais objeções" hint="O que faz essa pessoa hesitar antes de te contratar?">
              <Textarea
                value={state.audience_objections}
                onChange={(e) => set("audience_objections", e.target.value)}
              />
            </Field>
          </>
        )}

        {step === 3 && (
          <>
            <Field label="Como deseja ser reconhecido?">
              <Textarea
                value={state.positioning_recognition}
                onChange={(e) => set("positioning_recognition", e.target.value)}
                placeholder='Ex.: "A referência em direito trabalhista para pequenas empresas."'
              />
            </Field>
            <Field label="Quais assuntos deseja dominar?" hint="Separe por vírgula — viram seus pilares editoriais.">
              <Input
                defaultValue={state.main_themes.join(", ")}
                onChange={(e) => set("main_themes", commaToArray(e.target.value))}
              />
            </Field>
            <Field label="Quais assuntos NÃO deseja abordar?" hint="Separe por vírgula. Nunca aparecerão no seu conteúdo.">
              <Input
                defaultValue={state.forbidden_themes.join(", ")}
                onChange={(e) => set("forbidden_themes", commaToArray(e.target.value))}
              />
            </Field>
            <Field label="Quais valores são inegociáveis?">
              <Textarea value={state.core_values} onChange={(e) => set("core_values", e.target.value)} />
            </Field>
            <Field label="Como gostaria que as pessoas descrevessem você?">
              <Textarea
                value={state.desired_description}
                onChange={(e) => set("desired_description", e.target.value)}
              />
            </Field>
          </>
        )}

        {step === 4 && (
          <>
            <Field label="Como você quer soar?" hint="Escolha quantos combinarem com você.">
              <Chips
                options={TONE_OPTIONS.map((o) => ({ value: o, label: o }))}
                selected={state.tone_profile}
                onToggle={(v) => toggle("tone_profile", v as never)}
              />
            </Field>
            <Field label="Descreva seu tom com suas palavras" hint="Opcional.">
              <Input
                value={state.tone_of_voice}
                onChange={(e) => set("tone_of_voice", e.target.value)}
                placeholder="Próximo, direto, sem juridiquês…"
              />
            </Field>
            <Field label="Canais que você usa" hint="Separe por vírgula (Instagram, LinkedIn…).">
              <Input
                defaultValue={state.channels.join(", ")}
                onChange={(e) => set("channels", commaToArray(e.target.value))}
              />
            </Field>
          </>
        )}

        {step === 5 && (
          <>
            <Field label="Quantos dias por semana pretende publicar?">
              <Input
                type="number"
                min={1}
                max={7}
                value={state.publish_days_per_week}
                onChange={(e) => {
                  const days = Number(e.target.value);
                  set("publish_days_per_week", days);
                  if (days >= 1 && days <= 21) set("weekly_goal", days);
                }}
              />
            </Field>
            <Field label="Quais formatos prefere?">
              <Chips
                options={FORMAT_OPTIONS}
                selected={state.preferred_formats}
                onToggle={(v) => toggle("preferred_formats", v as never)}
              />
            </Field>
            <Field label="Quanto tempo você tem por dia?">
              <Input
                value={state.time_per_day}
                onChange={(e) => set("time_per_day", e.target.value)}
                placeholder="Ex.: 30 minutos"
              />
            </Field>
            <Field label="Você gosta de aparecer em vídeo?">
              <YesNo value={state.likes_video} onChange={(v) => set("likes_video", v)} />
            </Field>
            <Field label="Grava sozinho?">
              <YesNo value={state.records_alone} onChange={(v) => set("records_alone", v)} />
            </Field>
            <Field label="Tem equipe?">
              <YesNo value={state.has_team} onChange={(v) => set("has_team", v)} />
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
            <Field label="Nível de acompanhamento">
              <Chips
                options={FOLLOWUP}
                selected={[state.follow_up_level]}
                onToggle={(v) => set("follow_up_level", v as State["follow_up_level"])}
              />
            </Field>
          </>
        )}

        {step === 6 && (
          <>
            <p className="text-sm text-ink-500">
              Sites, blogs, newsletters, podcasts, canais, perfis, jornalistas, especialistas e
              autores que você acompanha. Elas alimentam o seu radar de pautas — com a prioridade
              que você definir.
            </p>
            {state.influence_sources.map((src, i) => (
              <div key={i} className="space-y-2 rounded-2xl bg-sand-100 p-3">
                <div className="flex gap-2">
                  <select
                    className={`${selectBase} flex-1`}
                    value={src.kind}
                    onChange={(e) => updateSource(i, { kind: e.target.value as InfluenceSourceInput["kind"] })}
                  >
                    {INFLUENCE_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeSource(i)}
                    className="shrink-0 rounded-full bg-sand-200 px-3 text-sm text-ink-500 hover:bg-sand-300"
                    aria-label="Remover fonte"
                  >
                    ✕
                  </button>
                </div>
                <Input
                  value={src.label}
                  onChange={(e) => updateSource(i, { label: e.target.value })}
                  placeholder="Nome (ex.: Migalhas, @perfil, nome do jornalista)"
                />
                <Input
                  value={src.url}
                  onChange={(e) => updateSource(i, { url: e.target.value })}
                  placeholder="Link (opcional)"
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-500">Prioridade:</span>
                  <Chips
                    options={PRIORITY_OPTIONS}
                    selected={[src.priority]}
                    onToggle={(v) => updateSource(i, { priority: v as InfluenceSourceInput["priority"] })}
                  />
                </div>
              </div>
            ))}
            <Button variant="secondary" full onClick={addSource} type="button">
              + Adicionar fonte
            </Button>
            <Field
              label="Existe alguma fonte que você NÃO deseja utilizar?"
              hint="Separe por vírgula ou linha. Nunca usaremos essas fontes."
            >
              <Textarea
                value={state.blocked_sources}
                onChange={(e) => set("blocked_sources", e.target.value)}
              />
            </Field>
          </>
        )}

        {step === 7 && (
          <>
            <p className="text-sm text-ink-500">
              Até 10 links de pessoas que inspiram sua comunicação. Analisamos o estilo, a
              estrutura e o tom delas para entender o que te atrai — sem copiar absolutamente
              nada.
            </p>
            {state.inspiration_refs.map((r, i) => (
              <div key={i} className="space-y-2 rounded-2xl bg-sand-100 p-3">
                <div className="flex gap-2">
                  <select
                    className={`${selectBase} flex-1`}
                    value={r.kind}
                    onChange={(e) => updateRef(i, { kind: e.target.value as InspirationRefInput["kind"] })}
                  >
                    {REFERENCE_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeRef(i)}
                    className="shrink-0 rounded-full bg-sand-200 px-3 text-sm text-ink-500 hover:bg-sand-300"
                    aria-label="Remover referência"
                  >
                    ✕
                  </button>
                </div>
                <Input
                  value={r.name}
                  onChange={(e) => updateRef(i, { name: e.target.value })}
                  placeholder="Nome da pessoa ou marca"
                />
                <Input
                  value={r.url}
                  onChange={(e) => updateRef(i, { url: e.target.value })}
                  placeholder="Link do perfil ou canal"
                />
              </div>
            ))}
            {state.inspiration_refs.length < 10 ? (
              <Button variant="secondary" full onClick={addRef} type="button">
                + Adicionar referência
              </Button>
            ) : (
              <p className="text-center text-xs text-ink-400">Limite de 10 referências.</p>
            )}
            <Field label="Maior bloqueio" hint="O que mais te trava na hora de publicar?">
              <Textarea value={state.main_block} onChange={(e) => set("main_block", e.target.value)} />
            </Field>
            <Field label="Motivação principal">
              <Textarea
                value={state.main_motivation}
                onChange={(e) => set("main_motivation", e.target.value)}
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
          {pending ? "Gerando seu DNA Editorial…" : isLast ? "Concluir anamnese" : "Continuar"}
        </Button>
      </div>
      {isLast ? (
        <p className="mt-3 text-center text-xs text-ink-400">
          Ao concluir, geramos o seu DNA Editorial — o documento que orienta toda a sua produção
          de conteúdo.
        </p>
      ) : null}
    </div>
  );
}
