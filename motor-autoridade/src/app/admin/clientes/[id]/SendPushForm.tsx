"use client";

import { useState, useTransition } from "react";
import { sendMotivationalPush } from "./actions";

/** Campo pra mandar um push motivacional pontual, sem gastar mensagem de WhatsApp. */
export function SendPushForm({ userId }: { userId: string }) {
  const [message, setMessage] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!message.trim()) return;
    startTransition(async () => {
      const result = await sendMotivationalPush({ userId, message });
      if (result.ok) {
        setFeedback({ ok: true, text: `Enviado (${result.sent} dispositivo(s)).` });
        setMessage("");
      } else {
        setFeedback({ ok: false, text: result.error });
      }
    });
  }

  return (
    <div className="space-y-2">
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Ex.: você ainda não gerou nada essa semana, dá uma olhada no app!"
        rows={2}
        maxLength={300}
        className="w-full rounded-xl border border-sand-200 p-2 text-sm text-ink-900 placeholder:text-ink-400"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !message.trim()}
          className="rounded-full bg-brand-700 px-4 py-1.5 text-sm text-sand-50 transition hover:bg-brand-800 disabled:opacity-50"
        >
          {pending ? "Enviando…" : "Enviar push"}
        </button>
        {feedback ? (
          <span className={`text-xs ${feedback.ok ? "text-brand-700" : "text-danger-700"}`}>
            {feedback.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}
