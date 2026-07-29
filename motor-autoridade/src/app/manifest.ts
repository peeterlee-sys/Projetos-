import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";

/**
 * Manifest do PWA gerado por marca — é o nome que aparece quando o cliente
 * adiciona o app à tela de início. Para `NEXT_PUBLIC_BRAND=take` o conteúdo é
 * idêntico ao manifest estático anterior; no Assessor 24h muda nome e descrição.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.name,
    short_name: brand.name,
    description: brand.description,
    start_url: brand.home,
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#faf7f2",
    theme_color: "#143627",
    lang: "pt-BR",
    categories: ["productivity", "business"],
    icons:
      brand.id === "assessor24h"
        ? [
            { src: "/icon-assessor24h.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
            { src: "/icon-192-assessor24h.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
            { src: "/icon-512-assessor24h.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ]
        : [
            { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
            { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
  };
}
