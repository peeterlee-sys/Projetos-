"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

type State = "unsupported" | "idle" | "granted" | "denied" | "working";

/** Botão para ativar notificações Web Push (solicita permissão + inscreve). */
export function EnableNotifications() {
  const [state, setState] = useState<State>("idle");
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !publicKey) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "granted") setState("granted");
    else if (Notification.permission === "denied") setState("denied");
  }, [publicKey]);

  async function enable() {
    if (!publicKey) return;
    setState("working");
    try {
      const reg =
        (await navigator.serviceWorker.getRegistration()) ??
        (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "idle");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
      });
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      setState("granted");
    } catch {
      setState("idle");
    }
  }

  if (state === "unsupported")
    return (
      <p className="text-xs text-ink-400">
        Notificações não são suportadas neste navegador. No iPhone, instale o app na tela inicial
        primeiro.
      </p>
    );
  if (state === "granted")
    return <p className="text-sm text-brand-700">Notificações ativadas ✓</p>;
  if (state === "denied")
    return (
      <p className="text-xs text-ink-400">
        Notificações bloqueadas. Reative nas configurações do navegador.
      </p>
    );

  return (
    <Button variant="secondary" full onClick={enable} disabled={state === "working"}>
      {state === "working" ? "Ativando…" : "Ativar notificações"}
    </Button>
  );
}
