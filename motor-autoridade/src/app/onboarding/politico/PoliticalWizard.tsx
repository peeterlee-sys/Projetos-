"use client";

import { useState, useTransition } from "react";
import { Button, Card, Field, Input, Textarea } from "@/components/ui";
import { submitAnamnesePolitica } from "./actions";
import {
  EMOJI_OPTIONS,
  FLAG_OPTIONS,
  HOW_TO_REFER_OPTIONS,
  MANDATE_OPTIONS,
  MAYOR_RELATION_OPTIONS,
  SLANG_OPTIONS,
  SPECTRUM_LABEL,
  TONE_OPTIONS,
  type PoliticalSpectrum,
} from "@/lib/validation/anamnese-politica";
import { formatPhoneBR } from "@/lib/phone";

/**
 * Espelha, seção por seção, o Google Form "Assessor 24h - Anamnese". As
 * perguntas, os textos de apoio e as alternativas são os mesmos do
 * formulário original — mudar qualquer um deles é decisão do cliente, não
 * do código.
 */
const STEPS = [
  "Identificação",
  "Posicionamento político",
  "Tom e estilo",
  "Limites e cuidados",
  "Referências",
  "Revisão e consentimento",
] as const;

const STEP_HINTS = [
  "Quem é você no mandato e nas urnas",
  "Onde você se posiciona e o que você defende",
  "Como o Assessor 24h deve escrever por você",
  "O que NUNCA deve aparecer nas suas comunicações",
  "Materiais que ajudam a capturar a sua voz",
  "Confira e autorize o uso dos seus dados",
] as const;

const SPECTRUM_OPTIONS = (Object.keys(SPECTRUM_LABEL) as PoliticalSpectrum[]).map((v) => ({
  value: v,
  label: SPECTRUM_LABEL[v],
}));

function Chips<T extends string>({
  options,
  selected,
  onToggle,
  disabledExtra,
}: {
  options: readonly T[];
  selected: T[];
  onToggle: (v: T) => void;
  /** Quando true, opções não selecionadas ficam desabilitadas (limite atingido). */
  disabledExtra?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = selected.includes(o);
        const blocked = !active && disabledExtra;
        return (
          <button
            type="button"
            key={o}
            onClick={() => !blocked && onToggle(o)}
            disabled={blocked}
            className={`rounded-full px-4 py-2 text-sm transition ${
              active
                ? "bg-brand-700 text-sand-50"
                : blocked
                  ? "cursor-not-allowed bg-sand-100 text-ink-400"
                  : "bg-sand-100 text-ink-700 hover:bg-sand-200"
            }`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

function RadioGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T | "";
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-2">
      {options.map((o) => (
        <label
          key={o}
          className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 text-sm transition ${
            value === o ? "border-brand-700 bg-brand-700/5" : "border-sand-300 bg-sand-50 hover:bg-sand-100"
          }`}
        >
          <input
            type="radio"
            className="mt-0.5"
            checked={value === o}
            onChange={() => onChange(o)}
          />
          <span className="text-ink-800">{o}</span>
        </label>
      ))}
    </div>
  );
}

/** Linha de revisão. Some quando não há resposta. */
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

/**
 * "Cidade e Estado" — o Google Form pede num único campo. Aqui separamos em
 * cidade + UF (que o banco guarda à parte) sem pedir dois campos ao vereador.
 */
function splitCityState(raw: string): { city: string; state: string } | null {
  const m = raw.trim().match(/^(.+?)[\s]*[-/,][\s]*([A-Za-z]{2})$/);
  if (!m) return null;
  return { city: m[1].trim(), state: m[2].toUpperCase() };
}

type State = {
  full_name: string;
  political_name: string;
  city_state: string;
  party: string;
  mandate: (typeof MANDATE_OPTIONS)[number] | "";
  positions: string;
  phone: string;
  political_spectrum: PoliticalSpectrum | "";
  flags: (typeof FLAG_OPTIONS)[number][];
  electoral_base: string;
  voter_profile: string;
  tone_of_voice: (typeof TONE_OPTIONS)[number] | "";
  slang_style: (typeof SLANG_OPTIONS)[number] | "";
  emoji_style: (typeof EMOJI_OPTIONS)[number] | "";
  how_to_refer: (typeof HOW_TO_REFER_OPTIONS)[number] | "";
  catchphrase: string;
  forbidden_themes: string;
  adversaries: string;
  mayor_relation: (typeof MAYOR_RELATION_OPTIONS)[number] | "";
  history_to_avoid: string;
  instagram_url: string;
  website_url: string;
  reference_publications: string;
  local_press: string;
  lgpd_consent: boolean;
};

const listToArray = (v: string) =>
  v
    .split(/[\n,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);

export function PoliticalWizard({ defaultName }: { defaultName: string }) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [state, setState] = useState<State>({
    full_name: defaultName,
    political_name: "",
    city_state: "",
    party: "",
    mandate: "",
    positions: "",
    phone: "",
    political_spectrum: "",
    flags: [],
    electoral_base: "",
    voter_profile: "",
    tone_of_voice: "",
    slang_style: "",
    emoji_style: "",
    how_to_refer: "",
    catchphrase: "",
    forbidden_themes: "",
    adversaries: "",
    mayor_relation: "",
    history_to_avoid: "",
    instagram_url: "",
    website_url: "",
    reference_publications: "",
    local_press: "",
    lgpd_consent: false,
  });

  const set = <K extends keyof State>(k: K, v: State[K]) => setState((s) => ({ ...s, [k]: v }));

  const toggleFlag = (v: (typeof FLAG_OPTIONS)[number]) =>
    setState((s) => {
      const has = s.flags.includes(v);
      if (has) return { ...s, flags: s.flags.filter((x) => x !== v) };
      if (s.flags.length >= 3) return s;
      return { ...s, flags: [...s.flags, v] };
    });

  const isLast = step === STEPS.length - 1;

  function validateStep(): string | null {
    if (step === 0) {
      if (state.full_name.trim().length < 2) return "Informe o nome completo.";
      if (state.political_name.trim().length < 2) return "Informe o nome político.";
      if (!splitCityState(state.city_state)) {
        return "Informe cidade e UF, ex.: Balneário Camboriú - SC.";
      }
      if (!state.party.trim()) return "Informe o partido atual.";
      if (!state.mandate) return "Selecione o número do mandato.";
      if (!state.positions.trim()) return 'Preencha os cargos — se não tiver, escreva "Nenhum".';
      if (!formatPhoneBR(state.phone) || state.phone.replace(/\D/g, "").length < 10) {
        return "Informe o WhatsApp com DDD, ex.: (47) 99184-8380.";
      }
    }
    if (step === 1) {
      if (!state.political_spectrum) return "Selecione seu posicionamento no espectro político.";
      if (state.flags.length === 0) return "Escolha ao menos 1 bandeira (até 3).";
      if (!state.electoral_base.trim()) return "Informe sua base eleitoral.";
      if (!state.voter_profile.trim()) return "Descreva o perfil do seu eleitorado.";
    }
    if (step === 2) {
      if (!state.tone_of_voice) return "Selecione o estilo de comunicação.";
      if (!state.slang_style) return "Selecione uma opção sobre gírias e expressões regionais.";
      if (!state.emoji_style) return "Selecione uma opção sobre emojis.";
      if (!state.how_to_refer) return "Selecione como devemos nos referir a você.";
      if (!state.catchphrase.trim()) return 'Preencha o bordão — se não tiver, escreva "Não".';
    }
    if (step === 3) {
      if (!state.forbidden_themes.trim())
        return 'Preencha os temas proibidos — se não houver, escreva "Nenhum".';
      if (!state.adversaries.trim())
        return 'Preencha os adversários — se não houver, escreva "Nenhum".';
      if (!state.mayor_relation) return "Selecione sua relação com o atual prefeito.";
      if (!state.history_to_avoid.trim())
        return 'Preencha o histórico a evitar — se não houver, escreva "Nenhum".';
    }
    if (step === 5 && !state.lgpd_consent) {
      return "É preciso aceitar o termo de consentimento para enviar a anamnese.";
    }
    return null;
  }

  function next() {
    const problem = validateStep();
    setError(problem);
    if (problem) return;

    if (isLast) {
      const cityState = splitCityState(state.city_state);
      if (!cityState) {
        setError("Informe cidade e UF, ex.: Balneário Camboriú - SC.");
        setStep(0);
        return;
      }
      startTransition(async () => {
        const res = await submitAnamnesePolitica({
          full_name: state.full_name,
          political_name: state.political_name,
          city: cityState.city,
          state: cityState.state,
          party: state.party,
          mandate: state.mandate as (typeof MANDATE_OPTIONS)[number],
          positions: listToArray(state.positions),
          phone: state.phone,
          political_spectrum: state.political_spectrum as PoliticalSpectrum,
          flags: state.flags,
          electoral_base: state.electoral_base,
          voter_profile: state.voter_profile,
          tone_of_voice: state.tone_of_voice as (typeof TONE_OPTIONS)[number],
          slang_style: state.slang_style as (typeof SLANG_OPTIONS)[number],
          emoji_style: state.emoji_style as (typeof EMOJI_OPTIONS)[number],
          how_to_refer: state.how_to_refer as (typeof HOW_TO_REFER_OPTIONS)[number],
          catchphrase: state.catchphrase,
          forbidden_themes: listToArray(state.forbidden_themes),
          adversaries: listToArray(state.adversaries),
          mayor_relation: state.mayor_relation as (typeof MAYOR_RELATION_OPTIONS)[number],
          history_to_avoid: state.history_to_avoid,
          instagram_url: state.instagram_url,
          website_url: state.website_url,
          reference_publications: listToArray(state.reference_publications),
          local_press: listToArray(state.local_press),
          lgpd_consent: state.lgpd_consent,
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
        {/* SEÇÃO 1 — Identificação */}
        {step === 0 && (
          <>
            <Field label="Nome Completo">
              <Input value={state.full_name} onChange={(e) => set("full_name", e.target.value)} />
            </Field>
            <Field
              label="Nome Político"
              hint='Como você aparece na urna, nas matérias e nas redes. Ex.: "João da Farmácia", "Professor João".'
            >
              <Input
                value={state.political_name}
                onChange={(e) => set("political_name", e.target.value)}
              />
            </Field>
            <Field label="Cidade e Estado" hint="Ex.: Balneário Camboriú - SC">
              <Input value={state.city_state} onChange={(e) => set("city_state", e.target.value)} />
            </Field>
            <Field label="Partido atual">
              <Input value={state.party} onChange={(e) => set("party", e.target.value)} />
            </Field>
            <Field label="Este é o seu...">
              <RadioGroup
                options={MANDATE_OPTIONS}
                value={state.mandate}
                onChange={(v) => set("mandate", v)}
              />
            </Field>
            <Field
              label="Cargos ou funções na Câmara"
              hint='Ex.: Presidente da Comissão de Saúde, Líder de bancada, Mesa Diretora. Se não tiver, escreva "Nenhum".'
            >
              <Input value={state.positions} onChange={(e) => set("positions", e.target.value)} />
            </Field>
            <Field
              label="WhatsApp que será usado no Assessor 24h"
              hint="Com DDD. Ex.: (47) 99999-9999. É por este número que o Assessor 24h te reconhece."
            >
              <Input
                value={state.phone}
                onChange={(e) => set("phone", e.target.value)}
                inputMode="tel"
                placeholder="(47) 99999-9999"
              />
            </Field>
          </>
        )}

        {/* SEÇÃO 2 — Posicionamento político */}
        {step === 1 && (
          <>
            <Field label="Como você define seu posicionamento no espectro político?">
              <RadioGroup
                options={SPECTRUM_OPTIONS.map((o) => o.label)}
                value={SPECTRUM_LABEL[state.political_spectrum as PoliticalSpectrum] ?? ""}
                onChange={(label) => {
                  const found = SPECTRUM_OPTIONS.find((o) => o.label === label);
                  if (found) set("political_spectrum", found.value);
                }}
              />
            </Field>
            <Field label="Quais são as principais bandeiras do seu mandato? (escolha até 3)">
              <Chips
                options={FLAG_OPTIONS}
                selected={state.flags}
                onToggle={toggleFlag}
                disabledExtra={state.flags.length >= 3}
              />
            </Field>
            <Field label="Quais bairros ou regiões da cidade são sua principal base eleitoral?">
              <Textarea
                value={state.electoral_base}
                onChange={(e) => set("electoral_base", e.target.value)}
              />
            </Field>
            <Field
              label="Qual é o perfil predominante do seu eleitorado?"
              hint="Ex.: famílias de classe média, idosos, jovens, comerciantes, comunidade evangélica, servidores públicos..."
            >
              <Textarea
                value={state.voter_profile}
                onChange={(e) => set("voter_profile", e.target.value)}
              />
            </Field>
          </>
        )}

        {/* SEÇÃO 3 — Tom e estilo de comunicação */}
        {step === 2 && (
          <>
            <Field label="Qual estilo de comunicação mais combina com você?">
              <RadioGroup
                options={TONE_OPTIONS}
                value={state.tone_of_voice}
                onChange={(v) => set("tone_of_voice", v)}
              />
            </Field>
            <Field label="Sobre gírias e expressões regionais">
              <RadioGroup
                options={SLANG_OPTIONS}
                value={state.slang_style}
                onChange={(v) => set("slang_style", v)}
              />
            </Field>
            <Field label="Sobre emojis nas publicações">
              <RadioGroup
                options={EMOJI_OPTIONS}
                value={state.emoji_style}
                onChange={(v) => set("emoji_style", v)}
              />
            </Field>
            <Field label="Nos textos em terceira pessoa (releases, matérias), como devemos nos referir a você?">
              <RadioGroup
                options={HOW_TO_REFER_OPTIONS}
                value={state.how_to_refer}
                onChange={(v) => set("how_to_refer", v)}
              />
            </Field>
            <Field
              label="Existe algum bordão, slogan ou frase de campanha que você usa?"
              hint='Ex.: "Trabalho que aparece", "Aqui tem trabalho". Se não tiver nenhum, escreva "Não".'
            >
              <Input value={state.catchphrase} onChange={(e) => set("catchphrase", e.target.value)} />
            </Field>
          </>
        )}

        {/* SEÇÃO 4 — Limites e cuidados */}
        {step === 3 && (
          <>
            <p className="text-sm text-ink-500">
              Tão importante quanto saber o que dizer é saber o que NUNCA dizer. Estas respostas
              são estritamente confidenciais.
            </p>
            <Field
              label="Quais temas NUNCA devem aparecer nas suas comunicações?"
              hint='Ex.: temas polêmicos nacionais, religião, futebol... Se não houver, escreva "Nenhum".'
            >
              <Input
                value={state.forbidden_themes}
                onChange={(e) => set("forbidden_themes", e.target.value)}
              />
            </Field>
            <Field
              label="Há adversários políticos ou figuras públicas que NÃO devem ser citados nos seus textos?"
              hint='Se não houver, escreva "Nenhum".'
            >
              <Input value={state.adversaries} onChange={(e) => set("adversaries", e.target.value)} />
            </Field>
            <Field label="Qual é a sua relação com o atual prefeito?">
              <RadioGroup
                options={MAYOR_RELATION_OPTIONS}
                value={state.mayor_relation}
                onChange={(v) => set("mayor_relation", v)}
              />
            </Field>
            <Field
              label="Existe algum assunto do seu histórico pessoal ou político que devemos evitar mencionar?"
              hint='Estritamente confidencial. Se não houver, escreva "Nenhum".'
            >
              <Textarea
                value={state.history_to_avoid}
                onChange={(e) => set("history_to_avoid", e.target.value)}
              />
            </Field>
          </>
        )}

        {/* SEÇÃO 5 — Referências */}
        {step === 4 && (
          <>
            <p className="text-sm text-ink-500">Materiais que nos ajudam a capturar a sua voz.</p>
            <Field label="Link do seu Instagram">
              <Input
                value={state.instagram_url}
                onChange={(e) => set("instagram_url", e.target.value)}
              />
            </Field>
            <Field label="Link do seu site ou outra rede social relevante">
              <Input value={state.website_url} onChange={(e) => set("website_url", e.target.value)} />
            </Field>
            <Field label='Cole aqui o link (ou o texto) de 2 ou 3 publicações que você considera "a sua cara"'>
              <Textarea
                value={state.reference_publications}
                onChange={(e) => set("reference_publications", e.target.value)}
              />
            </Field>
            <Field
              label="Quais veículos de imprensa locais costumam publicar suas pautas?"
              hint="Ex.: portais, rádios e jornais da sua cidade"
            >
              <Textarea value={state.local_press} onChange={(e) => set("local_press", e.target.value)} />
            </Field>
          </>
        )}

        {/* SEÇÃO 6 — Revisão e consentimento */}
        {step === 5 && (
          <>
            <p className="text-sm text-ink-500">
              Confira as respostas. Ao enviar, geramos o DNA Editorial do mandato — o documento
              que orienta o Assessor 24h em cada resposta.
            </p>
            <div className="rounded-2xl bg-sand-100 p-4">
              <Review label="Nome" value={`${state.political_name} (${state.full_name})`} />
              <Review label="WhatsApp" value={formatPhoneBR(state.phone)} />
              <Review label="Cidade e Estado" value={state.city_state} />
              <Review label="Mandato" value={[state.party, state.mandate].filter(Boolean).join(" · ")} />
              <Review label="Cargos" value={state.positions} />
              <Review
                label="Espectro"
                value={state.political_spectrum ? SPECTRUM_LABEL[state.political_spectrum] : ""}
              />
              <Review label="Bandeiras" value={state.flags} />
              <Review label="Estilo de comunicação" value={state.tone_of_voice} />
              <Review label="Bordão" value={state.catchphrase} />
              <Review label="Temas proibidos" value={state.forbidden_themes} />
              <Review label="Adversários (não citar)" value={state.adversaries} />
              <Review label="Relação com o prefeito" value={state.mayor_relation} />
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-sand-300 bg-sand-50 p-4 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={state.lgpd_consent}
                onChange={(e) => set("lgpd_consent", e.target.checked)}
              />
              <span className="text-ink-700">
                Autorizo o uso das informações fornecidas neste formulário exclusivamente para a
                personalização e prestação do serviço Assessor 24h, nos termos da Lei Geral de
                Proteção de Dados (Lei nº 13.709/2018). Estou ciente de que posso solicitar a
                exclusão dos meus dados a qualquer momento.
              </span>
            </label>
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
