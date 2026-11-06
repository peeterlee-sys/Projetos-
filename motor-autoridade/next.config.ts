import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // O binário do ffmpeg (~76MB) é carregado por caminho em tempo de execução,
  // então o rastreamento automático do Next não o enxerga e ele ficaria de fora
  // do pacote da função. Só quem corta vídeo precisa dele: incluir em todas as
  // rotas estouraria o teto de 250MB por função.
  //
  // São as duas que chamam processarJob: a que o vereador dispara e o cron que
  // retoma o que ficou pelo caminho. Esquecer uma delas só aparece em produção,
  // como "ffmpeg não disponível".
  outputFileTracingIncludes: {
    "/api/video/jobs": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/cron/video-pendentes": ["./node_modules/ffmpeg-static/ffmpeg"],
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
