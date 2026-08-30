import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Prefeitura Comunica",
    short_name: "Comunica",
    description: "Painel da assessoria de comunicação — releases dos secretários.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#1d4ed8",
    theme_color: "#1B74E4",
    lang: "pt-BR",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
