# Motor de Autoridade

Plataforma de **inteligência editorial**: do radar de pautas à gravação e publicação,
com a cara de cada cliente. App **mobile-first**, instalável como **PWA**, multicliente
com isolamento por RLS.

> Estado atual: **Fase 7 — Testes & polimento** concluída. Todas as 7 fases prontas.
> O roteiro completo de fases está em `../DIAGNOSTICO-MOTOR-AUTORIDADE.md`.

## Stack

- **Next.js 15** (App Router) · **React 19** · **TypeScript** · **Tailwind CSS 4**
- **Supabase**: Postgres + Auth + Row Level Security
- **Zod** para validação · **lucide-react** para ícones
- **PWA**: manifest + service worker + Web Push (estrutura pronta, ativa na Fase 5)

## Requisitos

- Node.js 20+
- Um projeto Supabase (gratuito serve para desenvolvimento)

## Configuração

### 1. Variáveis de ambiente

```bash
cp .env.example .env.local
```

Preencha com os valores do seu projeto Supabase (**Project Settings → API**):

| Variável | Onde obter |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (**apenas servidor**) |

> Nunca commite `.env.local`. A `service_role` ignora RLS — mantenha-a só no servidor.

### 2. Banco de dados

Aplique as migrações na ordem, no **SQL Editor** do Supabase (ou via Supabase CLI):

```
supabase/migrations/0001_schema.sql          -- tabelas, enums, índices, constraints
supabase/migrations/0002_functions.sql       -- triggers, helpers de RLS, contexto_mestre
supabase/migrations/0003_rls.sql             -- Row Level Security (isolamento)
supabase/migrations/0004_seed_templates.sql  -- templates visuais globais
supabase/migrations/0005_brand.sql           -- identidade visual do cliente (marca)
supabase/migrations/0006_editorial_dna.sql   -- anamnese completa, fontes, DNA Editorial
supabase/migrations/0007_signup_approval.sql   -- aprovação de cadastro (is_active pendente)
```

Com a Supabase CLI:

```bash
supabase link --project-ref <ref>
supabase db push
```

### 3. Autenticação

Em **Authentication → Providers**, habilite **Email**. Para desenvolvimento rápido,
desative "Confirm email" (assim o cadastro já cria sessão e vai direto ao onboarding).

### 4. Rodar

```bash
npm install
npm run dev
```

Acesse http://localhost:3000 → você é levado ao login. Após o cadastro, o **onboarding
obrigatório** coleta o perfil editorial e gera o `contexto_mestre`.

## Bootstrap de administrador

Novos usuários entram como `client`. Para promover alguém a `admin`/`super_admin`,
rode no SQL Editor (a coluna `role` é protegida contra auto-escalonamento):

```sql
update public.users set role = 'super_admin' where email = 'voce@exemplo.com';
```

## Estrutura de pastas

```
motor-autoridade/
├─ public/                 # manifest.webmanifest, sw.js, icon.svg
├─ supabase/migrations/    # SQL: schema, funções, RLS, seeds
├─ src/
│  ├─ app/
│  │  ├─ (auth)/           # login, signup
│  │  ├─ (app)/            # shell autenticado: hoje, biblioteca, progresso, perfil
│  │  ├─ auth/             # callback e signout
│  │  ├─ onboarding/       # wizard + server action
│  │  └─ layout.tsx        # fontes, PWA, SW
│  ├─ components/          # ui, nav, pwa (reutilizáveis)
│  ├─ lib/
│  │  ├─ supabase/         # clients server/browser/middleware
│  │  ├─ auth/             # session helpers
│  │  └─ validation/       # schemas Zod
│  └─ middleware.ts        # proteção de rotas + renovação de sessão
```

## Segurança (implementado nesta fase)

- **RLS forçada** em todas as tabelas: nenhum cliente vê dados de outro; nenhum tenant
  vê dados de outro. `super_admin` enxerga tudo.
- **Guard anti-escalonamento**: usuário não altera o próprio papel/tenant.
- **Middleware** protege rotas e impõe onboarding obrigatório.
- **service_role** nunca vai ao cliente.

## Scripts

| Comando | Ação |
|---|---|
| `npm run dev` | Ambiente de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |

## Fase 3 — Conteúdo (implementado)

- **Camada de IA abstrata** (`src/lib/ai/`): provedores Anthropic e OpenAI trocáveis
  (`AI_DEFAULT_PROVIDER`), saída estruturada validada com Zod, retries controlados e
  registro de custo/tokens em `cost_logs`. Modelo menor (Haiku) para classificação,
  maior (Opus) para geração.
- **Geração dos 5 formatos** (vídeo, carrossel, post, story, LinkedIn) a partir do
  `contexto_mestre` do cliente — cada formato adaptado, com a cara do cliente.
- **Tela Hoje** com a oportunidade do dia, ações e voz sem culpa; **workspace de conteúdo**
  (`/conteudo/[id]`) para gerar e visualizar cada formato e marcar como publicado.
- **Biblioteca** com busca e filtros por status.
- **Eventos comportamentais** (MÓDULO 7) registrados ao longo do fluxo.
- **Integração Make** (`POST /api/make`): endpoint único autenticado por **assinatura HMAC**
  (`x-motor-signature: sha256=<hex>` sobre o corpo bruto, segredo `MAKE_WEBHOOK_SECRET`),
  com **idempotency_key**, logs de execução e controle de duplicidade. Ações:
  `deliver_opportunity`, `get_profile`, `get_history`, `register_error`.

## Fase 5 — Comportamento (implementado)

- **Progresso** (MÓD 9): cálculo real a partir de dados (`content_items`, `deliveries`,
  `behavior_events`) — publicados, taxa de execução, sequência atual/melhor, formato
  preferido, comparação com a semana anterior. Métrica principal = publicado.
- **Motor de estímulos** (MÓD 8): mensagens sem culpa na tela Hoje, adaptadas à situação
  (vídeo gravado e não publicado, próximo da meta, retorno após pausa, radar quieto…).
- **Relatório semanal** (MÓD 10): geração automática em `/relatorio` + job
  `POST /api/cron/weekly` (protegido por `CRON_SECRET`) que gera o relatório de cada cliente.
- **Web Push** (MÓD 12): ativar em Perfil (`/api/push/subscribe` registra o dispositivo),
  envio via `web-push` no job semanal; o service worker já trata `push`/`notificationclick`.

### Configurar Web Push (VAPID)

```bash
npx web-push generate-vapid-keys
```

Preencha em `.env.local`: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
`VAPID_SUBJECT` (mailto:) e `CRON_SECRET`. No iOS, o Web Push exige o app instalado
na tela inicial (PWA).

## Fase 6 — Administração (implementado)

- **Dashboard admin** (`/admin`, MÓD 13): clientes ativos/novos, taxa de ativação,
  saúde dos clientes (saudável/atenção/risco), conteúdos entregues/abertos/produzidos/
  publicados, execução média, consumo de IA (soma de `cost_logs`) e erros abertos.
- **Perfil de cada cliente** (`/admin/clientes/[id]`): perfil editorial, progresso,
  custo de IA, bloqueios e conteúdos recentes.
- **Acesso por papel**: só `admin` e `super_admin` (gate no layout + RLS delimita o
  escopo — admin vê o tenant, super_admin vê tudo). Admins não passam pelo onboarding
  editorial. Link para o dashboard aparece no Perfil para esses papéis.

## Fase 7 — Testes & polimento (implementado)

Testes automatizados (Vitest) dos módulos críticos — rode com:

```bash
npm test
```

Cobertura atual (21 testes):
- `tests/stimulus.test.ts` — motor de estímulos sem culpa (MÓD 8).
- `tests/signature.test.ts` — verificação HMAC do webhook Make (MÓD 14).
- `tests/json.test.ts` — parsing robusto da saída da IA.
- `tests/schemas.test.ts` — validação Zod dos 5 formatos (MÓD 4).
- `tests/cost.test.ts` — estimativa de custo de IA (MÓD 18).

**Isolamento multicliente / RLS** (o teste mais crítico do MÓD 20) — script SQL
executável contra o seu Supabase (faz ROLLBACK ao final, não polui dados):

```bash
psql "$DATABASE_URL" -f supabase/tests/rls_isolation.sql
# sucesso = nenhuma exceção; qualquer vazamento aborta com erro
```

Polimento de segurança nesta fase:
- **Enforcement de limite de custo de IA** (MÓD 18): `AI_MONTHLY_COST_LIMIT_USD`
  bloqueia a geração quando o tenant excede o teto mensal.
- **Rate limiting** (MÓD 17) no webhook do Make (best-effort em memória; para limite
  global rígido, migrar para um store compartilhado tipo Redis).

## Pendências futuras (backlog)

Itens intencionalmente adiados para pós-MVP:
- **Testes em dispositivos reais** (iPhone/Android/Safari/Chrome) do teleprompter/gravação.
- **Testes e2e** do fluxo completo (Playwright) — o Chromium já está disponível no ambiente.
- **Formatos**: popular as tabelas-filhas dedicadas (`carousel_slides`, `static_posts`,
  `stories`, `linkedin_posts`) e `content_versions`; hoje o payload vive em `content_formats`.
- **MÓD 6/16**: render/preview/download de imagens por template (canvas/DOM → imagem).
- **Make**: implementar as ações restantes do dispatcher (`solicitar_ajuste`,
  `registrar_entrega`, `enviar_relatorio`, `disparar_notificacao`, etc.) e montar o
  cenário na plataforma make.com.
- **Radar automático**: pipeline de coleta/curadoria (integrar com o `porta-voz`).
- **Rate limit distribuído** e **preferências de notificação** (níveis leve/equilibrado/intenso,
  horário permitido, limite diário — colunas já existem em `client_preferences`).
- **Ícones PWA em PNG** (192/512) e apple-touch-icon para instalação plena no iOS.
- **Fase 5 — Comportamento**: metas, progresso, estímulos, Web Push, relatório semanal.
- **Fase 6 — Administração**: dashboard, clientes, logs, custos, erros.
- **Fase 7 — Testes & entrega**.
