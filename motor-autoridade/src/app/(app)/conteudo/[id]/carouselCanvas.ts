/**
 * Renderiza lâminas de carrossel em canvas (1080×1350, formato 4:5 do
 * Instagram) e baixa como PNG. Pinta com a marca do cliente — mesma lógica
 * visual da prévia na tela. Roda no cliente (usa document/canvas).
 */

export type SlideData = {
  cover?: boolean;
  eyebrow?: string;
  headline?: string;
  phrase?: string;
  index: number;
  total: number;
};

export type BrandColors = {
  primary: string;
  secondary: string;
  accent: string;
  logoUrl: string | null;
};

const W = 1080;
const H = 1350;
const PAD = 96;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Quebra o texto em linhas que cabem em maxWidth. */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawParagraph(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
): number {
  const lines = wrapLines(ctx, text, maxWidth);
  lines.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight));
  return y + lines.length * lineHeight;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Desenha uma lâmina em um canvas e devolve o canvas. */
export async function renderSlide(slide: SlideData, brand: BrandColors): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas não suportado neste navegador.");

  const bg = slide.cover ? brand.primary : brand.secondary;
  const fg = slide.cover ? brand.secondary : brand.primary;

  // Fundo
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Barra de destaque (topo esquerda)
  ctx.fillStyle = brand.accent;
  roundRect(ctx, PAD, PAD, 132, 18, 9);
  ctx.fill();

  // Índice / eyebrow (topo direita)
  ctx.fillStyle = fg;
  ctx.globalAlpha = 0.6;
  ctx.font = "600 30px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "right";
  const topRight = slide.cover ? (slide.eyebrow ?? "").toUpperCase() : `${slide.index}/${slide.total}`;
  if (topRight) ctx.fillText(topRight, W - PAD, PAD + 26);
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";

  // Bloco de texto (meio)
  const maxWidth = W - PAD * 2;
  let y = 640;
  if (slide.headline) {
    ctx.fillStyle = fg;
    ctx.font = "600 82px Georgia, 'Times New Roman', serif";
    y = drawParagraph(ctx, slide.headline, PAD, y, maxWidth, 92);
  }
  if (slide.phrase) {
    ctx.fillStyle = fg;
    ctx.globalAlpha = 0.85;
    ctx.font = "400 42px system-ui, -apple-system, sans-serif";
    drawParagraph(ctx, slide.phrase, PAD, y + 48, maxWidth, 56);
    ctx.globalAlpha = 1;
  }

  // Rodapé: "arraste →" (capa) e logo (direita)
  if (slide.cover) {
    ctx.fillStyle = fg;
    ctx.globalAlpha = 0.5;
    ctx.font = "400 30px system-ui, -apple-system, sans-serif";
    ctx.fillText("arraste →", PAD, H - PAD);
    ctx.globalAlpha = 1;
  }
  if (brand.logoUrl) {
    try {
      const img = await loadImage(brand.logoUrl);
      const maxH = 84;
      const maxLogoW = W * 0.38;
      const ratio = img.width / img.height || 1;
      let h = maxH;
      let w = h * ratio;
      if (w > maxLogoW) {
        w = maxLogoW;
        h = w / ratio;
      }
      ctx.drawImage(img, W - PAD - w, H - PAD - h, w, h);
    } catch {
      // Logo opcional: se falhar ao carregar, apenas ignora.
    }
  }

  return canvas;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Falha ao gerar PNG."))), "image/png");
  });
}

/** Baixa uma única lâmina como PNG. */
export async function downloadSlide(slide: SlideData, brand: BrandColors, filename: string) {
  await document.fonts?.ready?.catch?.(() => {});
  const canvas = await renderSlide(slide, brand);
  const blob = await canvasToBlob(canvas);
  triggerDownload(blob, filename);
}

/** Baixa todas as lâminas em sequência (um PNG por lâmina). */
export async function downloadAllSlides(slides: SlideData[], brand: BrandColors, prefix = "carrossel") {
  await document.fonts?.ready?.catch?.(() => {});
  for (let i = 0; i < slides.length; i++) {
    const canvas = await renderSlide(slides[i], brand);
    const blob = await canvasToBlob(canvas);
    const n = String(i + 1).padStart(2, "0");
    triggerDownload(blob, `${prefix}-${n}.png`);
    // Espaça os downloads para o navegador não bloquear/mesclar.
    await new Promise((r) => setTimeout(r, 350));
  }
}
