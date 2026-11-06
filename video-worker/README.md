# Porta Voz — Video Worker

Serviço separado (Node + ffmpeg) que edita os vídeos do vereador. O painel
(Vercel) **não** processa vídeo — ele manda o trabalho pra cá.

## O que faz

- **Cortar respiros** — remove silêncios/pausas longas (reaproveita vídeo e áudio em sincronia).
- **Legendas queimadas** — transcreve com Whisper e grava a legenda no vídeo (estilo Reels).
- **Juntar takes** — vários vídeos curtos viram um só, normalizados em 9:16 (1080×1920).

## Como o painel conversa com o worker

1. O painel sobe o(s) vídeo(s) pro Vercel Blob e pega as URLs.
2. `POST /jobs` com as URLs e as opções → responde `202 { id }`.
3. O painel consulta `GET /jobs/:id` até `status: "pronto"` → recebe `{ url, duracao }`.

### `POST /jobs`
```json
{
  "modo": "single",          // "single" (1 vídeo) ou "takes" (vários)
  "cortar": true,            // cortar respiros
  "legendas": true,          // queimar legendas (precisa de OPENAI_API_KEY)
  "videos": ["https://...blob.../take1.mp4", "https://...blob.../take2.mp4"]
}
```
Cabeçalho `x-worker-secret: <WORKER_SECRET>` quando o segredo está configurado.

### `GET /jobs/:id`
`status`: `na fila` → `baixando` → `editando` → `publicando` → `pronto` (ou `erro`).
Quando `pronto`: `{ url, duracao }`. O `url` já é público (Blob) e pronto pra baixar/postar.

## Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `WORKER_SECRET` | senha compartilhada com o painel (deixe vazio só em dev) |
| `OPENAI_API_KEY` | transcrição (Whisper) para as legendas |
| `BLOB_READ_WRITE_TOKEN` | mesma store de Blob do painel (pra devolver a URL do vídeo final) |
| `PORT` | porta HTTP (DigitalOcean injeta sozinho; padrão 8080) |

## Rodar local (dev)
```bash
npm install
node server.mjs            # sem segredo e sem Blob = modo dev (serve o resultado em /saida)
# testar o motor direto:
node editar.mjs saida.mp4 entrada.mp4
```

## Deploy no DigitalOcean (App Platform)

1. **Create → Apps** → conecta o repositório, pasta `video-worker/`.
2. Detecta o **Dockerfile** automaticamente.
3. Em **Environment Variables**, adicionar `WORKER_SECRET`, `OPENAI_API_KEY`, `BLOB_READ_WRITE_TOKEN` (todas como *encrypted*).
4. **HTTP Port**: 8080.
5. Plano **Basic** (menor) já dá conta de clipes curtos. Custo ~US$ 5–12/mês + Whisper por minuto transcrito.

> Vídeos longos/pesados: subir o plano ou trocar os jobs em memória por uma fila. A arquitetura já está pronta pra isso (o `jobs` Map é o único ponto a trocar).
