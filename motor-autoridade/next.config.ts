import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // O binário do ffmpeg (~76MB) é carregado por caminho em tempo de execução,
  // então o rastreamento automático do Next não o enxerga e ele ficaria de fora
  // do pacote da função. Só a rota de corte precisa dele: incluir em todas
  // estouraria o teto de 250MB por função.
  outputFileTracingIncludes: {
    "/api/video/cortar": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
  async headers() {
    return [
      {
        // Service worker must be served from the root scope without long caching.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
