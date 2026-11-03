"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Download, LoaderCircle, ImageOff } from "lucide-react";
import { corDaSecretaria, iniciaisCidade } from "./cardArte";

type Foto = { id: string; url: string | null; legenda: string | null };
type Release = {
  id: string; secretarioNome: string | null; secretaria: string | null;
  headline: string | null; fotos: Foto[];
};

// Cor base da prefeitura (logo + faixa). No futuro, virá do Contexto da cidade.
const COR_PREFEITURA = "#1e6fd9";

/** Converte a URL da foto em dataURL (evita "tainted canvas" na exportação). */
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

export default function CardModal({
  release, prefeituraNome, municipio, onClose, flash,
}: {
  release: Release;
  prefeituraNome: string | null;
  municipio: string | null;
  onClose: () => void;
  flash: (m: string) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [fotoData, setFotoData] = useState<string | null>(null);
  const [carregandoFoto, setCarregandoFoto] = useState(true);
  const [busy, setBusy] = useState(false);

  const fotoUrl = release.fotos?.find((f) => f.url)?.url ?? null;
  const corSec = corDaSecretaria(release.secretaria || "");
  const ini = iniciaisCidade(municipio, prefeituraNome);
  const headline = release.headline || "";
  const nomePref = prefeituraNome || (municipio ? `Prefeitura de ${municipio}` : "Prefeitura");

  useEffect(() => {
    let vivo = true;
    setCarregandoFoto(true);
    setFotoData(null);
    if (!fotoUrl) { setCarregandoFoto(false); return; }
    paraDataURL(fotoUrl).then((d) => {
      if (vivo) { setFotoData(d); setCarregandoFoto(false); }
    });
    return () => { vivo = false; };
  }, [fotoUrl]);

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

  // Preview reduzido do card (o card real é 1080×1350).
  const S = 0.306; // escala do preview

  const fundo: React.CSSProperties = fotoData
    ? { backgroundImage: `url(${fotoData})`, backgroundSize: "cover", backgroundPosition: "center" }
    : { background: `linear-gradient(135deg, ${COR_PREFEITURA} 0%, #1550a8 55%, #1f2733 120%)` };

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-2xl bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h3 className="font-bold">Card para redes sociais</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex flex-col items-center gap-3 p-5">
          {/* Moldura do preview (recorta o card em escala) */}
          <div
            className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
            style={{ width: 1080 * S, height: 1350 * S }}
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
                  ...fundo,
                }}
              >
                {/* escurecido pra legibilidade do texto sobre qualquer foto */}
                <div style={{
                  position: "absolute", left: 0, right: 0, bottom: 0, height: "64%",
                  background: "linear-gradient(to top, rgba(8,12,20,.97) 26%, rgba(8,12,20,.78) 54%, rgba(8,12,20,0) 100%)",
                }} />
                <div style={{ position: "absolute", left: 64, right: 64, bottom: 72, color: "#fff" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 24 }}>
                    <div style={{
                      width: 74, height: 74, borderRadius: "50%", background: "#fff", color: COR_PREFEITURA,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: 800, fontSize: 28, flex: "none", boxShadow: "0 2px 12px rgba(0,0,0,.4)",
                    }}>{ini}</div>
                    <div style={{ fontSize: 27, fontWeight: 700, lineHeight: 1.15, letterSpacing: ".2px" }}>{nomePref}</div>
                  </div>
                  <div style={{ width: 92, height: 7, borderRadius: 4, background: COR_PREFEITURA, margin: "4px 0 22px" }} />
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

          {!fotoUrl && (
            <p className="flex items-center gap-1.5 text-xs text-slate-400">
              <ImageOff className="h-3.5 w-3.5" /> Sem foto neste release — card gerado só com a cor da prefeitura.
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
          <p className="text-center text-[11px] text-slate-400">Formato de feed/retrato do Instagram. A cor da tag muda conforme a secretaria.</p>
        </div>
      </div>
    </div>
  );
}
