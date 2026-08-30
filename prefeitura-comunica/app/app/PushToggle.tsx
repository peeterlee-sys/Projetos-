"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, BellRing, LoaderCircle } from "lucide-react";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type Estado = "loading" | "unsupported" | "off" | "on" | "denied";

export default function PushToggle() {
  const [estado, setEstado] = useState<Estado>("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const registrar = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setEstado("unsupported");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      if (Notification.permission === "denied") return setEstado("denied");
      const sub = await reg.pushManager.getSubscription();
      setEstado(sub ? "on" : "off");
    } catch {
      setEstado("unsupported");
    }
  }, []);

  useEffect(() => {
    registrar();
  }, [registrar]);

  async function ativar() {
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setEstado(perm === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const res = await fetch("/api/push/vapid");
      const { key, enabled } = await res.json();
      if (!enabled || !key) {
        setMsg("Push ainda não configurado no servidor.");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      });
      const r = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub),
      });
      if (!r.ok) throw new Error("falha ao salvar");
      setEstado("on");
      setMsg("Notificações ativadas neste aparelho! 🔔");
    } catch {
      setMsg("Não consegui ativar. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  async function desativar() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setEstado("off");
      setMsg("Notificações desativadas neste aparelho.");
    } catch {
      setMsg("Não consegui desativar.");
    } finally {
      setBusy(false);
    }
  }

  if (estado === "loading" || estado === "unsupported") return null;

  const base =
    "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm";

  return (
    <div className="space-y-1">
      {estado === "on" ? (
        <button
          onClick={desativar}
          disabled={busy}
          className={`${base} border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100`}
        >
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
          Notificações ligadas
        </button>
      ) : estado === "denied" ? (
        <div className={`${base} border-slate-200 text-slate-500`}>
          <BellOff className="h-4 w-4" /> Notificações bloqueadas
        </div>
      ) : (
        <button
          onClick={ativar}
          disabled={busy}
          className={`${base} border-blue-200 bg-blue-50 font-semibold text-blue-800 hover:bg-blue-100`}
        >
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
          Ativar notificações
        </button>
      )}
      {msg && <p className="px-1 text-[11px] text-slate-500">{msg}</p>}
      {estado === "denied" && (
        <p className="px-1 text-[11px] text-slate-400">
          Libere as notificações nas configurações do navegador/app.
        </p>
      )}
    </div>
  );
}
