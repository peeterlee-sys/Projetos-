import "server-only";

/**
 * Armazenamento de imagens enviadas pelos secretários.
 *
 * Em escala, guardar a foto como data URI (base64) dentro do banco é caro e
 * lento — o painel baixa todas as fotos a cada abertura. Então, se houver um
 * storage configurado (Vercel Blob, via BLOB_READ_WRITE_TOKEN), subimos a foto
 * e guardamos só o link. Sem o token, mantemos o comportamento antigo (data
 * URI), pra não quebrar nada antes de o storage estar ligado.
 */

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

export function storageDisponivel(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

/**
 * Recebe a imagem (base64 + mediaType) e devolve uma URL utilizável no <img>.
 * - Com Vercel Blob: URL pública (https://…), leve de guardar no banco.
 * - Sem storage: data URI (fallback), igual ao comportamento atual.
 */
export async function saveImage(
  img: { base64: string; mediaType: string },
  prefeituraId: string,
): Promise<string> {
  const dataUri = `data:${img.mediaType};base64,${img.base64}`;

  if (!storageDisponivel()) return dataUri;

  try {
    const { put } = await import("@vercel/blob");
    const ext = EXT[img.mediaType] || "jpg";
    const buf = Buffer.from(img.base64, "base64");
    const nome = `fotos/${prefeituraId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const res = await put(nome, buf, {
      access: "public",
      contentType: img.mediaType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return res.url;
  } catch (e) {
    // Qualquer falha no storage → cai no data URI, nunca perde a foto.
    console.error("[storage] falha ao subir imagem, usando data URI", e);
    return dataUri;
  }
}
