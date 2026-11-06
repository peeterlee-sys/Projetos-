# Worker de edição de vídeo do Porta Voz — Node + ffmpeg.
FROM node:20-slim

# ffmpeg (corte/legenda/concat) + fontes DejaVu (legenda queimada).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instala só as dependências primeiro (cache de camada).
COPY package.json ./
RUN npm install --omit=dev

COPY editar.mjs server.mjs ./

ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.mjs"]
