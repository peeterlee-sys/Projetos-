"use client";

import { useEffect, useState } from "react";

/**
 * Tela de abertura (splash) com a logo e o nome do produto.
 * Aparece ao abrir o app e some suavemente, caindo no dashboard.
 */
export default function Splash({ nome }: { nome?: string }) {
  const [fade, setFade] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setFade(true), 1400);
    const t2 = setTimeout(() => setGone(true), 1900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (gone) return null;

  return (
    <div
      className={`fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5 bg-gradient-to-b from-blue-600 to-blue-800 transition-opacity duration-500 ${
        fade ? "opacity-0" : "opacity-100"
      }`}
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icon-512.png"
        alt="Porta Voz"
        className="h-24 w-24 rounded-3xl shadow-xl ring-1 ring-white/20"
      />
      <div className="text-center">
        <div className="text-3xl font-extrabold tracking-tight text-white">Porta Voz</div>
        <div className="mt-1 text-sm font-medium text-blue-100">
          {nome || "Prefeitura Comunica"}
        </div>
      </div>
      <div className="mt-2 flex gap-1.5">
        <span className="h-2 w-2 animate-bounce rounded-full bg-white/80 [animation-delay:-0.3s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-white/80 [animation-delay:-0.15s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-white/80" />
      </div>
    </div>
  );
}
