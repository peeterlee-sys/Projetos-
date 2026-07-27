"use client";

import { useState, useTransition } from "react";
import { Button, Card, Field, Input, Textarea } from "@/components/ui";
import { submitAnamnesePolitica } from "./actions";
import { SPECTRUM_LABEL, type PoliticalSpectrum } from "@/lib/validation/anamnese-politica";
import type { InfluenceSourceInput, InspirationRefInput } from "@/lib/validation/onboarding";
import { formatPhoneBR } from "@/lib/phone";

const STEPS = [
  "Identificação",
  "Posicionamento",
  "Tom e estilo",
  "Limites",
  "Referências",
  "Influências",
  "Preferências",
  "Revisão",
] as const;

const STEP_HINTS = [
  "Quem é o mandato",
  "O que o mandato defende",
  "Como o vereador fala",
  "O que nunca pode aparecer",
  "Onde o mandato já se expressa",
  "O que o mandato acompanha",
  "Ritmo e metas de conteúdo",
  "Confira antes de enviar",
] as const;

const TONE_OPTIONS = [
  "Direto e objetivo",
  "Popular e próximo",
  "Firme e combativo",
  "Institucional",
  "Didático",
  "Acolhedor",
  "Bem-humorado",
  "Técnico",
  "Inspirador",
] as const;

const FORMAT_OPTIONS = [
  { value: "video", label: "Vídeo" },
  { value: "carousel", label: "Carrossel" },
  { value: "story", label: "Story" },
  { value: "post", label: "Texto" },
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

const SPECTRUM_OPTIONS = (Object.keys(SPECTRUM_LABEL) as PoliticalSpectrum[]).map((v) => ({
  value: v,
  label: SPECTRUM_LABEL[v],
}));

const MAYOR_OPTIONS = [
  "Situação (apoio o prefeito)",
  "Independente",
  "Oposição",
  "Depende da pauta",
] as const;

const INFLUENCE_KINDS = [
  { value: "site", label: "Site / portal" },
  { value: "blog", label: "Blog" },
  { value: "newsletter", label: "Newsletter" },
  { value: "podcast", label: "Podcast" },
  { value: "youtube", label: "YouTube" },
  { value: "instagram", label: "Instagram" },
  { value: "journalist", label: "Jornalista" },
  { value: "expert", label: "Especialista" },
  { value: "other", label: "Outro" },
] as const;

const REFERENCE_KINDS = [
  { value: "instagram", label: "Instagram" },
  { value: "youtube", label: "YouTube" },
  { value: "site", label: "Site" },
  { value: "linkedin", label: "LinkedIn" },
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

const EMOJI_OPTIONS = ["💪", "🙏", "✅", "🚨", "📌", "❤️", "🇧🇷", "👏", "🔊", "🏘️"] as const;

/** Estado do formulário: strings livres; a conversão para array acontece no envio. */
type State = {
  full_name: string;
  political_name: string;
  phone: string;
  city: string;
  state: string;
  party: string;
  mandate: string;
  positions: string[];
  political_spectrum: PoliticalSpectrum;
  flags: string[];
  electoral_base: string;
  voter_profile: string;
  audience_pains: string;
  positioning_recognition: string;
  tone_profile: string[];
  tone_of_voice: string;
  slang_expressions: string[];
  emojis: string[];
  how_to_refer: string;
  catchphrase: string;
  forbidden_themes: string[];
  adversaries: string[];
  mayor_relation: string;
  history_to_avoid: string;
  core_values: string;
  instagram_url: string;
  website_url: string;
  reference_publications: string[];
  local_press: string[];
  inspiration_refs: InspirationRefInput[];
  influence_sources: InfluenceSourceInput[];
  blocked_sources: string;
  main_themes: string[];
  audience_segments: string[];
  preferred_formats: ("video" | "carousel" | "post" | "story" | "linkedin")[];
  publish_days_per_week: number;
  weekly_goal: number;
  preferred_days: number[];
  video_duration_sec: number;
  follow_up_level: "light" | "balanced" | "intense";
};

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
              active ? "bg-brand-700 text-sand-50" : "bg-sand-100 text-ink-700 hover:bg-sand-200"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Linha de revisão. Some quando não há resposta — a revisão mostra o que existe. */
function Review({ label, value }: { label: string; value: string | string[] }) {
  const text = Array.isArray(value) ? value.filter(Boolean).join(", ") : value;
  if (!text?.trim()) return null;
  return (
    <div className="border-t border-sand-200 py-2 first:border-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-0.5 text-sm text-ink-700">{text}</p>
    </div>
  );
}

const selectBase =
  "w-full rounded-2xl border border-sand-300 bg-sand-50 px-4 py-3 text-ink-900 outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-700/20";

export function PoliticalWizard({ defaultName }: { defaultName: string }) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [state, setState] = useState<State>({
    full_name: defaultName,
    political_name: "",
    phone: "",
    city: "",
    state: "",
    party: "",
    mandate: "",
    positions: [],
    political_spectrum: "nao_declarado",
    flags: [],
    electoral_base: "",
    voter_profile: "",
    audience_pains: "",
    positioning_recognition: "",
    tone_profile: [],
    tone_of_voice: "",
    slang_expressions: [],
    emojis: [],
    how_to_refer: "",
    catchphrase: "",
    forbidden_themes: [],
    adversaries: [],
    mayor_relation: "",
    history_to_avoid: "",
    core_values: "",
    instagram_url: "",
    website_url: "",
    reference_publications: [],
    local_press: [],
    inspiration_refs: [],
    influence_sources: [],
    blocked_sources: "",
    main_themes: [],
    audience_segments: [],
    preferred_formats: ["video"],
    publish_days_per_week: 3,
    weekly_goal: 3,
    preferred_days: [1, 3, 5],
    video_duration_sec: 60,
    follow_up_level: "balanced",
  });

  const set = <K extends keyof State>(k: K, v: State[K]) => setState((s) => ({ ...s, [k]: v }));

  const toggle = <K extends keyof State>(k: K, v: State[K] extends (infer U)[] ? U : never) =>
    setState((s) => {
      const arr = s[k] as unknown[];
      const has = arr.includes(v);
      return { ...s, [k]: has ? arr.filter((x) => x !== v) : [...arr, v] } as State;
    });

  const listToArray = (v: string) =>
    v
      .split(/[\n,;]+/)
      .map((x) => x.trim())
      .filter(Boolean);

  // ── Fontes de influência ──────────────────────────────────────────────────
  const addSource = () =>
    setState((s) =>
      s.influence_sources.length >= 80
        ? s
        : {
            ...s,
            influence_sources: [
              ...s.influence_sources,
              { kind: "site", label: "", url: "", priority: "medium", is_blocked: false },
            ],
          }
    );
  const updateSource = (i: number, patch: Partial<InfluenceSourceInput>) =>
    setState((s) => ({
      ...s,
      influence_sources: s.influence_sources.map((src, j) => (j === i ? { ...src, ...patch } : src)),
    }));
  const removeSource = (i: number) =>
    setState((s) => ({ ...s, influence_sources: s.influence_sources.filter((_, j) => j !== i) }));

  // ── Referências de inspiração ─────────────────────────────────────────────
  const addRef = () =>
    setState((s) =>
      s.inspiration_refs.length >= 10
        ? s
        : { ...s, inspiration_refs: [...s.inspiration_refs, { kind: "instagram", url: "", name: "" }] }
    );
  const updateRef = (i: number, patch: Partial<InspirationRefInput>) =>
    setState((s) => ({
      ...s,
      inspiration_refs: s.inspiration_refs.map((r, j) => (j === i ? { ...r, ...patch } : r)),
    }));
  const removeRef = (i: number) =>
    setState((s) => ({ ...s, inspiration_refs: s.inspiration_refs.filter((_, j) => j !== i) }));

  const isLast = step === STEPS.length - 1;

  /** Validação por etapa: só o essencial trava — o resto é opcional. */
  function validateStep(): string | null {
    if (step === 0) {
      if (state.full_name.trim().length < 2) return "Informe o nome completo.";
      if (state.political_name.trim().length < 2) return "Informe o nome de urna.";
      if (!formatPhoneBR(state.phone) || state.phone.replace(/\D/g, "").length < 10) {
        return "Informe o WhatsApp com DDD, ex.: (47) 99184-8380.";
      }
      if (state.city.trim().length < 2) return "Informe a cidade.";
      if (state.state.trim().length !== 2) return "Use a sigla da UF, ex.: SC.";
    }
    if (step === 1 && state.flags.length === 0) {
      return "Informe ao menos uma bandeira do mandato.";
    }
    return null;
  }

  function next() {
    const problem = validateStep();
    setError(problem);
    if (problem) return;

    if (isLast) {
      startTransition(async () => {
        const res = await submitAnamnesePolitica({
          ...state,
          inspiration_refs: state.inspiration_refs.filter((r) => r.url.trim()),
          influence_sources: state.influence_sources.filter((s) => s.label.trim() || s.url.trim()),
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
          Etapa {step + 1} de {STEPS.length} · {STEP_HINTS[step]}
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
        {/* 1. Identificação */}
        {step === 0 && (
          <>
            <Field label="Nome completo">
              <Input value={state.full_name} onChange={(e) => set("full_name", e.target.value)} />
            </Field>
            <Field label="Nome político" hint="Como aparece na urna e como o povo chama.">
              <Input
                value={state.political_name}
                onChange={(e) => set("political_name", e.target.value)}
                placeholder="Ex.: Zé do Bairro"
              />
            </Field>
            <Field label="WhatsApp do mandato" hint="É por este número que o Assessor 24h te reconhece.">
              <Input
                value={state.phone}
                onChange={(e) => set("phone", e.target.value)}
                inputMode="tel"
                placeholder="(47) 99184-8380"
              />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Field label="Cidade">
                  <Input value={state.city} onChange={(e) => set("city", e.target.value)} />
                </Field>
              </div>
              <Field label="UF">
                <Input
                  value={state.state}
                  onChange={(e) => set("state", e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="SC"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Partido">
                <Input value={state.party} onChange={(e) => set("party", e.target.value)} />
              </Field>
              <Field label="Mandato">
                <Input
                  value={state.mandate}
                  onChange={(e) => set("mandate", e.target.value)}
                  placeholder="2º (2025–2028)"
                />
              </Field>
            </div>
            <Field label="Cargos e comissões" hint="Separe por vírgula.">
              <Input
                defaultValue={state.positions.join(", ")}
                onChange={(e) => set("positions", listToArray(e.target.value))}
                placeholder="Presidente da Comissão de Saúde, Líder de bancada"
              />
            </Field>
          </>
        )}

        {/* 2. Posicionamento */}
        {step === 1 && (
          <>
            <Field label="Espectro político">
              <select
                className={selectBase}
                value={state.political_spectrum}
                onChange={(e) => set("political_spectrum", e.target.value as PoliticalSpectrum)}
              >
                {SPECTRUM_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Bandeiras do mandato" hint="Separe por vírgula. Viram os pilares do conteúdo.">
              <Input
                defaultValue={state.flags.join(", ")}
                onChange={(e) => set("flags", listToArray(e.target.value))}
                placeholder="Saúde na periferia, mobilidade, pequeno comércio"
              />
            </Field>
            <Field label="Base eleitoral" hint="Bairros, regiões e grupos onde estão seus votos.">
              <Textarea
                value={state.electoral_base}
                onChange={(e) => set("electoral_base", e.target.value)}
              />
            </Field>
            <Field label="Perfil do eleitorado">
              <Textarea
                value={state.voter_profile}
                onChange={(e) => set("voter_profile", e.target.value)}
                placeholder="Idade, ocupação, renda, o que consome nas redes…"
              />
            </Field>
            <Field label="Principais dores desse eleitorado">
              <Textarea
                value={state.audience_pains}
                onChange={(e) => set("audience_pains", e.target.value)}
                placeholder="O que faz a pessoa procurar o gabinete."
              />
            </Field>
            <Field label="Como quer ser reconhecido">
              <Textarea
                value={state.positioning_recognition}
                onChange={(e) => set("positioning_recognition", e.target.value)}
                placeholder='Ex.: "O vereador que resolve o problema do bairro."'
              />
            </Field>
          </>
        )}

        {/* 3. Tom e estilo */}
        {step === 2 && (
          <>
            <Field label="Como o mandato deve soar?" hint="Escolha quantos combinarem.">
              <Chips
                options={TONE_OPTIONS.map((o) => ({ value: o, label: o }))}
                selected={state.tone_profile}
                onToggle={(v) => toggle("tone_profile", v as never)}
              />
            </Field>
            <Field label="Descreva o tom com suas palavras" hint="Opcional.">
              <Input
                value={state.tone_of_voice}
                onChange={(e) => set("tone_of_voice", e.target.value)}
                placeholder="Falo como quem senta no bar com o eleitor."
              />
            </Field>
            <Field label="Gírias e expressões que você usa" hint="Separe por vírgula. É o que te faz soar você.">
              <Input
                defaultValue={state.slang_expressions.join(", ")}
                onChange={(e) => set("slang_expressions", listToArray(e.target.value))}
                placeholder="meu povo, tamo junto, na prática"
              />
            </Field>
            <Field label="Emojis que combinam com você" hint="Se não usa emoji, é só não marcar nenhum.">
              <Chips
                options={EMOJI_OPTIONS.map((e) => ({ value: e, label: e }))}
                selected={state.emojis}
                onToggle={(v) => toggle("emojis", v as never)}
              />
            </Field>
            <Field label="Como as pessoas devem se referir a você?">
              <Input
                value={state.how_to_refer}
                onChange={(e) => set("how_to_refer", e.target.value)}
                placeholder="Vereador Zé / Zé do Bairro / Professor Zé"
              />
            </Field>
            <Field label="Seu bordão" hint="A frase que fecha seus vídeos e posts.">
              <Input
                value={state.catchphrase}
                onChange={(e) => set("catchphrase", e.target.value)}
                placeholder="Trabalho que se vê, resultado que se sente."
              />
            </Field>
          </>
        )}

        {/* 4. Limites */}
        {step === 3 && (
          <>
            <p className="text-sm text-ink-500">
              Tudo aqui é regra absoluta: nunca aparece no seu conteúdo, nem por insinuação.
            </p>
            <Field label="Temas proibidos" hint="Separe por vírgula.">
              <Input
                defaultValue={state.forbidden_themes.join(", ")}
                onChange={(e) => set("forbidden_themes", listToArray(e.target.value))}
                placeholder="aborto, futebol, religião alheia"
              />
            </Field>
            <Field label="Adversários que não devem ser citados" hint="Nomes, separados por vírgula.">
              <Input
                defaultValue={state.adversaries.join(", ")}
                onChange={(e) => set("adversaries", listToArray(e.target.value))}
              />
            </Field>
            <Field label="Relação com o prefeito">
              <Chips
                options={MAYOR_OPTIONS.map((o) => ({ value: o, label: o }))}
                selected={state.mayor_relation ? [state.mayor_relation] : []}
                onToggle={(v) => set("mayor_relation", state.mayor_relation === v ? "" : (v as string))}
              />
            </Field>
            <Field label="Histórico a evitar" hint="Episódios que não devem ser trazidos à tona.">
              <Textarea
                value={state.history_to_avoid}
                onChange={(e) => set("history_to_avoid", e.target.value)}
              />
            </Field>
            <Field label="Valores inegociáveis">
              <Textarea value={state.core_values} onChange={(e) => set("core_values", e.target.value)} />
            </Field>
          </>
        )}

        {/* 5. Referências */}
        {step === 4 && (
          <>
            <div className="grid gap-3">
              <Field label="Instagram do mandato">
                <Input
                  value={state.instagram_url}
                  onChange={(e) => set("instagram_url", e.target.value)}
                  placeholder="@vereadorze"
                />
              </Field>
              <Field label="Site ou outra rede">
                <Input
                  value={state.website_url}
                  onChange={(e) => set("website_url", e.target.value)}
                  placeholder="https://…"
                />
              </Field>
            </div>
            <Field
              label="Publicações que representam bem o mandato"
              hint="Cole os links, um por linha — servem de calibragem de estilo."
            >
              <Textarea
                defaultValue={state.reference_publications.join("\n")}
                onChange={(e) => set("reference_publications", listToArray(e.target.value))}
              />
            </Field>
            <Field
              label="Imprensa local"
              hint="Jornais, rádios, portais e blogs que cobrem sua cidade — um por linha."
            >
              <Textarea
                defaultValue={state.local_press.join("\n")}
                onChange={(e) => set("local_press", listToArray(e.target.value))}
                placeholder="Rádio Cidade AM&#10;Portal Notícias do Vale"
              />
            </Field>
            <div className="space-y-2">
              <p className="text-sm font-medium text-ink-700">Quem inspira sua comunicação</p>
              <p className="text-xs text-ink-400">
                Até 10 perfis. Analisamos estilo e estrutura para entender o que te atrai — sem
                copiar nada.
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
                    placeholder="Nome da pessoa ou perfil"
                  />
                  <Input
                    value={r.url}
                    onChange={(e) => updateRef(i, { url: e.target.value })}
                    placeholder="Link do perfil"
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
            </div>
          </>
        )}

        {/* 6. Influências */}
        {step === 5 && (
          <>
            <p className="text-sm text-ink-500">
              Portais, rádios, jornalistas, colunistas e perfis que você acompanha. Eles alimentam o
              radar de pautas do mandato, na prioridade que você definir.
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
                  placeholder="Nome (ex.: Rádio Cidade, @jornalista)"
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
            {state.influence_sources.length < 80 ? (
              <Button variant="secondary" full onClick={addSource} type="button">
                + Adicionar fonte
              </Button>
            ) : (
              <p className="text-center text-xs text-ink-400">Limite de 80 fontes.</p>
            )}
            <Field
              label="Alguma fonte que NÃO deve ser usada?"
              hint="Separe por vírgula ou linha. Nunca consultaremos essas fontes."
            >
              <Textarea
                value={state.blocked_sources}
                onChange={(e) => set("blocked_sources", e.target.value)}
              />
            </Field>
          </>
        )}

        {/* 7. Preferências */}
        {step === 6 && (
          <>
            <Field
              label="Temas principais do conteúdo"
              hint="Separe por vírgula. Em branco, usamos as bandeiras do mandato."
            >
              <Input
                defaultValue={state.main_themes.join(", ")}
                onChange={(e) => set("main_themes", listToArray(e.target.value))}
              />
            </Field>
            <Field label="Segmentação" hint="Bairros, categorias e grupos que você quer alcançar.">
              <Input
                defaultValue={state.audience_segments.join(", ")}
                onChange={(e) => set("audience_segments", listToArray(e.target.value))}
                placeholder="Centro, Vila Nova, professores, comerciantes"
              />
            </Field>
            <Field label="Formatos preferidos">
              <Chips
                options={FORMAT_OPTIONS}
                selected={state.preferred_formats}
                onToggle={(v) => toggle("preferred_formats", v as never)}
              />
            </Field>
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
            <Field label="Dias preferidos">
              <Chips
                options={DAY_OPTIONS}
                selected={state.preferred_days}
                onToggle={(v) => toggle("preferred_days", v as never)}
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
            <Field label="Nível de acompanhamento">
              <Chips
                options={FOLLOWUP}
                selected={[state.follow_up_level]}
                onToggle={(v) => set("follow_up_level", v as State["follow_up_level"])}
              />
            </Field>
          </>
        )}

        {/* 8. Revisão */}
        {step === 7 && (
          <>
            <p className="text-sm text-ink-500">
              Confira as respostas. Ao enviar, geramos o DNA Editorial do mandato — o documento que
              orienta o Assessor 24h em cada resposta.
            </p>
            <div className="rounded-2xl bg-sand-100 p-4">
              <Review label="Nome" value={`${state.political_name} (${state.full_name})`} />
              <Review label="WhatsApp" value={formatPhoneBR(state.phone)} />
              <Review
                label="Mandato"
                value={[state.city && `${state.city}/${state.state}`, state.party, state.mandate]
                  .filter(Boolean)
                  .join(" · ")}
              />
              <Review label="Cargos" value={state.positions} />
              <Review label="Espectro" value={SPECTRUM_LABEL[state.political_spectrum]} />
              <Review label="Bandeiras" value={state.flags} />
              <Review label="Base eleitoral" value={state.electoral_base} />
              <Review label="Tom" value={state.tone_profile} />
              <Review label="Expressões" value={state.slang_expressions} />
              <Review label="Emojis" value={state.emojis} />
              <Review label="Bordão" value={state.catchphrase} />
              <Review label="Temas proibidos" value={state.forbidden_themes} />
              <Review label="Adversários (não citar)" value={state.adversaries} />
              <Review label="Relação com o prefeito" value={state.mayor_relation} />
              <Review label="Imprensa local" value={state.local_press} />
              <Review label="Fontes" value={`${state.influence_sources.length} cadastrada(s)`} />
              <Review label="Referências" value={`${state.inspiration_refs.length} link(s)`} />
              <Review label="Meta semanal" value={`${state.weekly_goal} publicações`} />
            </div>
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
          {pending ? "Gerando o DNA do mandato…" : isLast ? "Enviar anamnese" : "Continuar"}
        </Button>
      </div>
    </div>
  );
}
