# Motor de Autoridade

Plataforma de **inteligência editorial**: do radar de pautas à gravação e publicação,
com a cara de cada cliente. App **mobile-first**, instalável como **PWA**, multicliente
com isolamento por RLS.

> Estado atual: **Fase 2 — Fundação** concluída (auth + banco + RLS + onboarding + shell + PWA).
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

## Próximas fases

- **Fase 3 — Conteúdo**: tela Hoje com pautas reais, 5 formatos, biblioteca, endpoints Make.
- **Fase 4 — Teleprompter**: câmera, rolagem, gravação local, salvamento no dispositivo.
- **Fase 5 — Comportamento**: metas, progresso, estímulos, Web Push, relatório semanal.
- **Fase 6 — Administração**: dashboard, clientes, logs, custos, erros.
- **Fase 7 — Testes & entrega**.
