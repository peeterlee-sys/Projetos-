# Ruah CRM - Pipeline de Vendas (OOH/DOOH)

CRM de pipeline de vendas da Ruah, com quadro Kanban, lembretes com alerta
automatico via WhatsApp/e-mail e alimentacao automatica de leads a partir de
mensagens de WhatsApp.

## Funcionalidades

- **Pipeline Kanban** com os estagios: A Prospectar, Contato Feito, Interesse
  Confirmado, Proposta Enviada e Fechado. Arraste os cards entre colunas para
  mudar o estagio.
- **Cada lead** guarda nome do contato, telefone, e-mail, segmento, canal de
  origem, valor em negociacao e um **historico** completo de interacoes
  (notas, ligacoes, mudancas de estagio, mensagens de WhatsApp recebidas etc.).
- **Lembretes** (ex: "Reuniao dia 09/07/26 as 16h") com envio automatico de
  alerta via **WhatsApp**, **e-mail** ou ambos, no horario agendado.
- **Alimentacao via WhatsApp**: configurando o webhook da WhatsApp Cloud API
  (Meta) apontando para este projeto, uma mensagem como abaixo cria ou
  atualiza um lead automaticamente no pipeline:

  ```
  Novo lead
  Nome: Joao Silva - Loja Centro
  Contato: (11) 99876-5432
  Segmento: Varejo
  Canal: Indicacao
  Valor: R$ 15.000
  ```

  Os rotulos (Nome, Contato/Telefone, Segmento, Canal/Origem, Valor/Proposta)
  podem vir em qualquer ordem. Se a mensagem nao tiver o formato estruturado,
  o sistema ainda cria o lead com o numero/nome do contato do WhatsApp e
  registra a mensagem inteira no historico - nada se perde. Se o numero que
  enviou a mensagem ja for de um lead existente, os dados sao atualizados e a
  mensagem e adicionada ao historico, sem duplicar o lead. O remetente recebe
  uma confirmacao automatica por WhatsApp do que foi registrado.

## Stack

Next.js 15 (App Router) + TypeScript + Tailwind CSS 4, Drizzle ORM sobre
libSQL/SQLite (compativel com Turso para producao), dnd-kit para o Kanban,
Zod para validacao, Nodemailer para e-mail e a WhatsApp Cloud API (Meta) para
WhatsApp.

## Como rodar localmente

```bash
npm install
cp .env.example .env      # ajuste as variaveis, veja abaixo
npm run db:generate       # gera as migracoes a partir do schema (ja versionadas em src/db/migrations)
npm run db:migrate        # aplica as migracoes no banco local (ruah-crm.db)
npm run db:seed           # (opcional) popula com leads de exemplo
npm run dev                # http://localhost:3000
```

## Variaveis de ambiente (`.env`)

Veja `.env.example` para a lista completa. Resumo:

| Variavel | Para que serve |
|---|---|
| `DATABASE_URL` | `file:./ruah-crm.db` local, ou uma URL `libsql://...` do Turso em producao |
| `DATABASE_AUTH_TOKEN` | Token do Turso (producao) |
| `CRON_SECRET` | Protege `/api/cron/lembretes` contra chamadas externas nao autorizadas |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Token usado no handshake de verificacao do webhook da Meta |
| `WHATSAPP_API_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` | Credenciais da WhatsApp Cloud API para enviar mensagens (alertas e confirmacoes) |
| `WHATSAPP_ALERT_RECIPIENTS` | Numeros (com DDI) que recebem os alertas de lembrete via WhatsApp, separados por virgula |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Credenciais SMTP para envio de e-mail |
| `EMAIL_ALERT_RECIPIENTS` | E-mails que recebem os alertas de lembrete, separados por virgula |

Sem as credenciais de WhatsApp/SMTP configuradas, o sistema continua
funcionando normalmente (CRUD, Kanban, historico) - apenas o envio efetivo do
alerta e da confirmacao fica desativado e um aviso e registrado no log do
servidor.

## Configurando o WhatsApp (entrada e saida de mensagens)

1. Crie um app no [Meta for Developers](https://developers.facebook.com/) com
   o produto **WhatsApp** e obtenha `WHATSAPP_PHONE_NUMBER_ID` e um token de
   acesso (`WHATSAPP_API_TOKEN`; use um token permanente de usuario de
   sistema para producao).
2. Configure o webhook do produto WhatsApp apontando para
   `https://SEU_DOMINIO/api/webhook/whatsapp`, usando o mesmo valor de
   `WHATSAPP_WEBHOOK_VERIFY_TOKEN` definido no `.env`.
3. Assine o campo `messages`. A partir dai, qualquer mensagem recebida no
   numero da Ruah passa a ser processada por este endpoint.

## Lembretes e alertas agendados

Os lembretes ficam com status `pendente` ate a data/hora chegarem. Como a
Vercel/servidores serverless nao mantem processos rodando o tempo todo, o
disparo dos alertas precisa ser acionado periodicamente por um dos dois
mecanismos abaixo (o processamento em si e o mesmo):

- **Cron externo**: chame `GET /api/cron/lembretes?secret=SEU_CRON_SECRET`
  (ou `Authorization: Bearer SEU_CRON_SECRET`) a cada minuto, via Vercel Cron,
  cron-job.org, GitHub Actions scheduled workflow etc.
- **Worker standalone** (para deploy self-hosted/VPS com processo
  persistente): `npm run reminders:worker`, que roda em loop usando
  `node-cron` (padrao a cada minuto; ajustavel via
  `REMINDER_CRON_EXPRESSION`).

Quando o horario do lembrete chega, o sistema dispara o alerta pelo canal
escolhido (`whatsapp`, `email` ou `ambos`), marca o lembrete como `enviado`
(ou `erro` se o envio falhar) e registra o resultado no historico do lead.

## Estrutura do projeto

```
src/
  app/
    page.tsx                 # pagina do Kanban (server component)
    api/
      leads/                 # CRUD de leads, historico e lembretes
      lembretes/[id]/        # editar/cancelar lembrete
      webhook/whatsapp/      # entrada de mensagens (Meta Cloud API)
      cron/lembretes/        # dispara alertas de lembretes vencidos
  components/                 # Kanban, card, drawer de detalhes, modal de novo lead
  db/                          # schema Drizzle, client, migracoes, seed
  lib/
    leads.ts                  # consultas e helpers de lead/historico
    reminders.ts               # processamento de lembretes vencidos
    notifications/             # adapters de WhatsApp (Cloud API) e e-mail (SMTP)
    whatsapp-parser.ts          # extracao de campos de mensagens de texto livre
    whatsapp-inbound.ts         # cria/atualiza lead a partir de mensagem recebida
  scripts/
    reminder-worker.ts          # worker standalone (node-cron) para self-hosting
```
