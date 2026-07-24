"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { saveBrand } from "./actions";

type Brand = {
  brand_primary: string;
  brand_secondary: string;
  brand_accent: string;
  logo_url: string | null;
};

const DEFAULTS: Brand = {
  brand_primary: "#1d4a38",
  brand_secondary: "#faf7f2",
  brand_accent: "#c9a94e",
  logo_url: null,
};

/**
 * Redimensiona a imagem escolhida para no máx. 320px e devolve um data URL
 * PNG leve — evita depender de Storage e mantém o logo junto do perfil.
 */
function fileToResizedDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 320;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("canvas"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => reject(new Error("img"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("reader"));
    reader.readAsDataURL(file);
  });
}

export function BrandSettings({ initial }: { initial: Partial<Brand> }) {
  const [brand, setBrand] = useState<Brand>({
    brand_primary: initial.brand_primary || DEFAULTS.brand_primary,
    brand_secondary: initial.brand_secondary || DEFAULTS.brand_secondary,
    brand_accent: initial.brand_accent || DEFAULTS.brand_accent,
    logo_url: initial.logo_url ?? null,
  });
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const set = (k: keyof Brand, v: string | null) =>
    setBrand((b) => ({ ...b, [k]: v }));

  async function onPickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg(null);
    try {
      const dataUrl = await fileToResizedDataUrl(file);
      set("logo_url", dataUrl);
    } catch {
      setMsg({ ok: false, text: "Não consegui ler essa imagem. Tente outra." });
    }
  }

  function save() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveBrand({
        brand_primary: brand.brand_primary,
        brand_secondary: brand.brand_secondary,
        brand_accent: brand.brand_accent,
        logo_url: brand.logo_url ?? "",
      });
      setMsg(
        res.ok
          ? { ok: true, text: "Marca salva! Seus carrosséis já usam essas cores." }
          : { ok: false, text: res.error },
      );
    });
  }

  return (
    <div className="rounded-[24px] bg-white p-5 ring-1 ring-sand-200">
      <p className="font-semibold text-ink-900">Sua marca</p>
      <p className="mt-1 text-sm text-ink-500">
        Suas cores e seu logo entram nos carrosséis e posts — pra que seu
        conteúdo tenha a sua cara, não a de todo mundo.
      </p>

      {/* Cores */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <ColorField
          label="Principal"
          value={brand.brand_primary}
          onChange={(v) => set("brand_primary", v)}
        />
        <ColorField
          label="Fundo"
          value={brand.brand_secondary}
          onChange={(v) => set("brand_secondary", v)}
        />
        <ColorField
          label="Destaque"
          value={brand.brand_accent}
          onChange={(v) => set("brand_accent", v)}
        />
      </div>

      {/* Logo */}
      <div className="mt-5">
        <p className="mb-2 text-xs uppercase tracking-wide text-ink-400">
          Logo (opcional)
        </p>
        <div className="flex items-center gap-3">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-sand-100 ring-1 ring-sand-200">
            {brand.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brand.logo_url}
                alt="Logo"
                className="h-full w-full object-contain"
              />
            ) : (
              <span className="text-2xl text-ink-400">＋</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              {brand.logo_url ? "Trocar logo" : "Enviar logo"}
            </Button>
            {brand.logo_url ? (
              <Button variant="ghost" onClick={() => set("logo_url", null)}>
                Remover
              </Button>
            ) : null}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={onPickLogo}
          />
        </div>
      </div>

      {/* Prévia de uma lâmina */}
      <div className="mt-5">
        <p className="mb-2 text-xs uppercase tracking-wide text-ink-400">Prévia</p>
        <div
          className="relative flex aspect-square w-40 flex-col justify-between rounded-2xl p-4"
          style={{ backgroundColor: brand.brand_secondary }}
        >
          <div
            className="h-1.5 w-10 rounded-full"
            style={{ backgroundColor: brand.brand_accent }}
          />
          <p
            className="font-serif text-lg leading-tight"
            style={{ color: brand.brand_primary }}
          >
            Sua ideia,
            <br />a sua cara.
          </p>
          {brand.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logo_url}
              alt="Logo"
              className="absolute bottom-3 right-3 h-6 w-auto max-w-[40%] object-contain"
            />
          ) : null}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          {pending ? "Salvando..." : "Salvar marca"}
        </Button>
        {msg ? (
          <span
            className={`text-sm ${msg.ok ? "text-brand-700" : "text-danger-600"}`}
          >
            {msg.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-ink-500">{label}</span>
      <span className="flex items-center gap-2 rounded-xl border border-sand-300 bg-sand-50 px-2 py-1.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-7 shrink-0 cursor-pointer rounded-md border-0 bg-transparent p-0"
          aria-label={label}
        />
        <span className="font-mono text-xs uppercase text-ink-700">{value}</span>
      </span>
    </label>
  );
}
