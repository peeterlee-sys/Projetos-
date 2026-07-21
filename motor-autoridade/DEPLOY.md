# Plano de implantação — Motor de Autoridade

Guia passo a passo para colocar o MVP no ar (fases 1-7) e conectar o cenário do Make.
Ordem recomendada. Tempo estimado: ~45-60 min na primeira vez.

---

## 0. Pré-requisitos

- Conta **Supabase** (grátis serve para começar).
- Conta de host para **Next.js** — recomendado **Vercel** (grátis).
- Chave de IA: **Anthropic** (`ANTHROPIC_API_KEY`) e/ou **OpenAI**.
- Node.js 20+ local (para gerar segredos e, se quiser, rodar migrações via CLI).

---

## 1. Supabase — banco, RLS e auth

### 1.1 Criar o projeto
1. supabase.com → **New project**. Guarde a senha do banco.
2. **Project Settings → API**: copie `Project URL`, `anon public` e `service_role`.

### 1.2 Aplicar as migrações (na ordem)
No painel: **SQL Editor** → cole e rode cada arquivo, nesta sequência:

```
supabase/migrations/0001_schema.sql          -- tabelas, enums, índices, constraints
supabase/migrations/0002_functions.sql       -- triggers, helpers de RLS, contexto_mestre
supabase/migrations/0003_rls.sql             -- Row Level Security (isolamento)
supabase/migrations/0004_seed_templates.sql  -- templates visuais globais
```

Ou via CLI:
```bash
supabase link --project-ref <ref>
supabase db push
```

### 1.3 Validar o isolamento (recomendado)
```bash
psql "$DATABASE_URL" -f supabase/tests/rls_isolation.sql
# sucesso = nenhuma exceção; qualquer vazamento aborta com erro
```

### 1.4 Habilitar autenticação
**Authentication → Providers → Email**: habilite. Para começar rápido, desative
"Confirm email" (cadastro já cria sessão e vai ao onboarding).

---

## 2. Gerar segredos

```bash
# Segredo do webhook do Make (use o MESMO valor no app e no Make)
openssl rand -hex 32

# Segredo do cron semanal
openssl rand -hex 32

# Chaves Web Push (VAPID)
npx web-push generate-vapid-keys
```

---

## 3. Deploy do app (Vercel)

1. vercel.com → **Add New → Project** → importe o repositório.
2. **Root Directory**: `motor-autoridade` (o app é um subdiretório do monorepo).
3. Framework: Next.js (detectado). Build/Output: padrão.
4. **Environment Variables** — preencha (ver `.env.example`):

| Variável | Valor |
|---|---|
| `NEXT_PUBLIC_APP_URL` | a URL pública do deploy (ex.: `https://motor.vercel.app`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
| `AI_DEFAULT_PROVIDER` | `anthropic` (ou `openai`) |
| `ANTHROPIC_API_KEY` | sua chave (ou `OPENAI_API_KEY`) |
| `AI_MONTHLY_COST_LIMIT_USD` | teto mensal por tenant (opcional; vazio = sem limite) |
| `MAKE_WEBHOOK_SECRET` | o hex gerado no passo 2 |
| `CRON_SECRET` | o hex gerado no passo 2 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | chave pública VAPID |
| `VAPID_PRIVATE_KEY` | chave privada VAPID |
| `VAPID_SUBJECT` | `mailto:voce@dominio.com` |

5. **Deploy**. Anote a URL final.

---

## 4. Bootstrap do administrador

Crie sua conta pelo `/signup` do app, depois promova no **SQL Editor**:
```sql
update public.users set role = 'super_admin' where email = 'voce@exemplo.com';
```
Agora `/perfil` mostra o link do **Dashboard administrativo** (`/admin`).

---

## 5. Conectar o cenário do Make

Cenário já criado: **"Motor de Autoridade · Radar → Entrega (multi-cliente)"** (id 5722991), desativado.

1. Abra-o no Make (My Team).
2. Nos **dois** módulos HTTP (2 e 6): troque a URL `https://REPLACE-WITH-APP-URL/api/make`
   por `https://SUA-URL/api/make`.
3. Nos mesmos módulos, no header `x-motor-signature`: troque `REPLACE_WITH_MAKE_WEBHOOK_SECRET`
   pelo mesmo valor de `MAKE_WEBHOOK_SECRET` do app.
4. Módulo 4 (Claude): confirme o **modelo** no dropdown.
5. **Run once** e confira: o app responde a lista de clientes, o Claude gera uma pauta
   por cliente e cada `deliver_opportunity` retorna `{"status":"ok","opportunity_id":"..."}`.
6. Se ok, **ative** o cenário.

> Pré-condição: precisa haver clientes cadastrados (papel `client`, ativos, onboarding
> concluído) para o `list_clients` retornar algo.

---

## 6. Agendar o relatório semanal (cron)

O job `POST /api/cron/weekly` (protegido por `CRON_SECRET`) gera o relatório de cada
cliente e dispara o Web Push. Agende-o com uma das opções:

- **Vercel Cron** (`vercel.json`):
  ```json
  { "crons": [{ "path": "/api/cron/weekly", "schedule": "0 20 * * 5" }] }
  ```
  (adicione o header `x-cron-secret` via um proxy, ou use a variante `?secret=` na URL).
- **Make/cron externo**: um cenário simples com HTTP GET para
  `https://SUA-URL/api/cron/weekly` e header `x-cron-secret: <CRON_SECRET>`, toda sexta 20h.

---

## 7. Testes de fumaça (smoke tests)

1. `/signup` → criar conta → **onboarding** (perfil editorial) → cai na tela **Hoje**.
2. Rodar o cenário do Make (Run once) → a pauta do dia aparece em **Hoje**.
3. **Começar conteúdo** → gerar os 5 formatos → **marcar como publicado**.
4. Vídeo → **Gravar com teleprompter** (permitir câmera) → gravar → salvar/baixar.
5. **Progresso** e **Relatório** mostram os números reais.
6. `/perfil` → **Ativar notificações** (em produção/HTTPS; no iPhone, instale o PWA primeiro).
7. `/admin` (como admin) → dashboard e perfil de cliente.

---

## 8. Notas de produção

- **iOS Web Push**: só funciona com o PWA **instalado na tela inicial** (iOS 16.4+).
- **Ícones PWA**: hoje há `icon.svg`; gere PNG 192/512 e apple-touch-icon para instalação
  plena (pendência de backlog).
- **Rate limit do Make webhook** é best-effort em memória; para limite rígido em produção
  multi-instância, migrar para um store compartilhado (Redis/Upstash).
- **Custos de IA**: acompanhe em `/admin` (consumo por tenant) e ajuste
  `AI_MONTHLY_COST_LIMIT_USD`.
- **Backups**: o Supabase faz backup automático no plano pago; para o plano free,
  exporte periodicamente.
