"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { suggestTopic } from "./actions";

export function SuggestForm({ error }: { error: string | null }) {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [pending, startTransition] = useTransition();
  const [localError, setLocalError] = useState<string | null>(error);

  function submit() {
    setLocalError(null);
    startTransition(async () => {
      const res = await suggestTopic(idea);
      if (res.ok) {
        router.push(`/oportunidade/${res.oppId}`);
      } else {
        setLocalError(res.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      <textarea
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        rows={4}
        maxLength={500}
        placeholder="Ex: os bastidores das convenções em SC e o que aprendi organizando tudo…"
        className="w-full resize-y rounded-2xl border border-sand-300 bg-sand-50 px-4 py-3 text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand-700 focus:ring-2 focus:ring-brand-700/20"
      />
      {localError ? <p className="text-sm text-danger-600">{localError}</p> : null}
      <Button full onClick={submit} disabled={pending || idea.trim().length < 3}>
        {pending ? "Montando sua pauta…" : "Transformar em pauta"}
      </Button>
      <p className="text-center text-xs text-ink-400">
        A IA respeita seu tom e seus temas — a pauta sai com a sua cara.
      </p>
    </div>
  );
}
