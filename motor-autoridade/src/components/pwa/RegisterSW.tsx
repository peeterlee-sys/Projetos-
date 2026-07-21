"use client";

import { useEffect } from "react";

/** Registra o service worker (PWA) no cliente, após o load. */
export function RegisterSW() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return; // evita cache atrapalhando o dev

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Falha silenciosa: PWA é progressivo, o app continua funcionando.
      });
    };
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
