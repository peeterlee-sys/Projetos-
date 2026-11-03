"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Download, LoaderCircle, ImageOff, RotateCcw, Move } from "lucide-react";
import { corDaSecretaria, iniciaisCidade } from "./cardArte";

type Foto = { id: string; url: string | null; legenda: string | null };
type Release = {
  id: string; secretarioNome: string | null; secretaria: string | null;
  headline: string | null; fotos: Foto[];
};

const COR_PADRAO = "#1e6fd9";

/** Converte a URL (foto/logo) em dataURL — evita "tainted canvas" na exportação. */
async function paraDataURL(url: string): Promise<string | null> {
  if (url.startsWith("data:")) return url;
  try {
    const res = await fetch(url, { mode: "cors", cache: "no-store" });
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));

export default function CardModal({
  release, prefeituraNome, municipio, cor, logoUrl, onClose, flash,
}: {
  release: Release;
  prefeituraNome: string | null;
  municipio: string | null;
  cor?: string | null;
  logoUrl?: string | null;
  onClose: () => void;
  flash: (m: string) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const comFoto = release.fotos?.filter((f) => f.url) ?? [];
  const [fotoIdx, setFotoIdx] = useState(0);
  const [fotoData, setFotoData] = useState<string | null>(null);
  const [logoData, setLogoData] = useState<string | null>(null);
  const [carregandoFoto, setCarregandoFoto] = useState(comFoto.length > 0);
  const [busy, setBusy] = useState(false);

  // Enquadramento
  const [posX, setPosX] = useState(50);
  const [posY, setPosY] = useState(50);
  const [zoom, setZoom] = useState(1);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const COR = cor || COR_PADRAO;
  const corSec = corDaSecretaria(release.secretaria || "");
  const ini = iniciaisCidade(municipio, prefeituraNome);
  const headline = release.headline || "";
  const nomePref = prefeituraNome || (municipio ? `Prefeitura de ${municipio}` : "Prefeitura");
  const fotoUrl = comFoto[fotoIdx]?.url ?? null;

  useEffect(() => {
    let vivo = true;
    setCarregandoFoto(!!fotoUrl);
    setFotoData(null);
    setPosX(50); setPosY(50); setZoom(1);
    if (!fotoUrl) { setCarregandoFoto(false); return; }
    paraDataURL(fotoUrl).then((d) => { if (vivo) { setFotoData(d); setCarregandoFoto(false); } });
    return () => { vivo = false; };
  }, [fotoUrl]);

  useEffect(() => {
    let vivo = true;
    if (!logoUrl) { setLogoData(null); return; }
    paraDataURL(logoUrl).then((d) => { if (vivo) setLogoData(d); });
    return () => { vivo = false; };
  }, [logoUrl]);

  // Arrastar para enquadrar
  function onDown(e: React.PointerEvent) {
    if (!fotoData) return;
    drag.current = { x: e.clientX, y: e.clientY };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  function onMove(e: React.PointerEvent) {
    if (!drag.current || !frameRef.current) return;
    const r = frameRef.current.getBoundingClientRect();
    const dx = ((e.clientX - drag.current.x) / r.width) * 100;
    const dy = ((e.clientY - drag.current.y) / r.height) * 100;
    setPosX((p) => clamp(p - dx));
    setPosY((p) => clamp(p - dy));
    drag.current = { x: e.clientX, y: e.clientY };
  }
  function onUp() { drag.current = null; }

  const baixar = useCallback(async () => {
    if (!cardRef.current) return;
    setBusy(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(cardRef.current, {
        width: 1080, height: 1350, pixelRatio: 1, cacheBust: true,
        style: { transform: "none", margin: "0" },
      });
      const a = document.createElement("a");
      const slug = (release.secretaria || "release").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      a.href = dataUrl;
      a.download = `card-${slug || "release"}.png`;
      a.click();
      flash("Card baixado 🎨");
    } catch {
      flash("Não consegui gerar o card. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }, [release.secretaria, flash]);

  const S = 0.306; // escala do preview

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5">
      <div onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h3 className="font-bold">Card para redes sociais</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex flex-col items-center gap-3 p-5">
          {/* Moldura do preview */}
          <div
            ref={frameRef}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={onUp}
            className="relative select-none overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
            style={{ width: 1080 * S, height: 1350 * S, cursor: fotoData ? "grab" : "default", touchAction: "none" }}
          >
            {carregandoFoto && (
              <div className="absolute inset-0 z-10 flex items-center justify-center text-slate-400">
                <LoaderCircle className="h-6 w-6 animate-spin" />
              </div>
            )}
            <div style={{ transform: `scale(${S})`, transformOrigin: "top left" }}>
              {/* ===== CARD REAL 1080×1350 ===== */}
              <div
                ref={cardRef}
                style={{
                  width: 1080, height: 1350, position: "relative", overflow: "hidden",
                  fontFamily: '-apple-system, "Segoe UI", Roboto, "DejaVu Sans", sans-serif',
                  background: fotoData ? "#0b1018" : `linear-gradient(135deg, ${COR} 0%, #1550a8 55%, #1f2733 120%)`,
                }}
              >
                {fotoData && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={fotoData}
                    alt=""
                    draggable={false}
                    style={{
                      position: "absolute", inset: 0, width: "100%", height: "100%",
                      objectFit: "cover", objectPosition: `${posX}% ${posY}%`,
                      transform: `scale(${zoom})`, transformOrigin: "center",
                    }}
                  />
                )}
                <div style={{
                  position: "absolute", left: 0, right: 0, bottom: 0, height: "64%",
                  background: "linear-gradient(to top, rgba(8,12,20,.97) 26%, rgba(8,12,20,.78) 54%, rgba(8,12,20,0) 100%)",
                }} />
                <div style={{ position: "absolute", left: 64, right: 64, bottom: 72, color: "#fff" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 24 }}>
                    {logoData ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoData} alt="" style={{ width: 74, height: 74, borderRadius: "50%", objectFit: "contain", padding: 7, boxSizing: "border-box", background: "#fff", flex: "none", boxShadow: "0 2px 12px rgba(0,0,0,.4)" }} />
                    ) : (
                      <div style={{
                        width: 74, height: 74, borderRadius: "50%", background: "#fff", color: COR,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 800, fontSize: 28, flex: "none", boxShadow: "0 2px 12px rgba(0,0,0,.4)",
                      }}>{ini}</div>
                    )}
                    <div style={{ fontSize: 27, fontWeight: 700, lineHeight: 1.15, letterSpacing: ".2px" }}>{nomePref}</div>
                  </div>
                  <div style={{ width: 92, height: 7, borderRadius: 4, background: COR, margin: "4px 0 22px" }} />
                  <div style={{ fontSize: 58, fontWeight: 800, lineHeight: 1.1, letterSpacing: "-.5px", textShadow: "0 2px 20px rgba(0,0,0,.5)" }}>
                    {headline}
                  </div>
                  {release.secretaria && (
                    <div style={{ marginTop: 28 }}>
                      <span style={{ display: "inline-block", background: corSec, color: "#fff", padding: "9px 18px", borderRadius: 9, fontSize: 22, fontWeight: 700 }}>
                        {release.secretaria}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Seleção de foto (quando há mais de uma) */}
          {comFoto.length > 1 && (
            <div className="flex flex-wrap justify-center gap-2">
              {comFoto.map((f, i) => (
                <button
                  key={f.id}
                  onClick={() => setFotoIdx(i)}
                  className={`h-12 w-12 overflow-hidden rounded-lg border-2 ${i === fotoIdx ? "border-blue-600" : "border-slate-200"}`}
                  title={`Foto ${i + 1}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url ?? ""} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {/* Controles de enquadramento */}
          {fotoData ? (
            <div className="w-full space-y-2.5 rounded-lg bg-slate-50 p-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <Move className="h-3.5 w-3.5" /> Arraste a foto no quadro para enquadrar
              </div>
              <div className="flex items-center gap-2">
                <span className="w-10 text-xs text-slate-500">Zoom</span>
                <input
                  type="range" min={1} max={2.2} step={0.02} value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1 accent-blue-600"
                />
                <button
                  onClick={() => { setPosX(50); setPosY(50); setZoom(1); }}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-white"
                >
                  <RotateCcw className="h-3 w-3" /> Redefinir
                </button>
              </div>
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-slate-400">
              <ImageOff className="h-3.5 w-3.5" /> Sem foto neste release — card só com a cor da prefeitura.
            </p>
          )}

          <button
            onClick={baixar}
            disabled={busy || carregandoFoto}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
          >
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Baixar PNG (1080×1350)
          </button>
          <p className="text-center text-[11px] text-slate-400">Formato de feed/retrato do Instagram. A tag muda de cor conforme a secretaria.</p>
        </div>
      </div>
    </div>
  );
}
