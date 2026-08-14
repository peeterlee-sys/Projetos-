# Porta Voz — Prefeitura Comunica

Backend + painel da assessoria de comunicação municipal. O secretário manda um
áudio (ou texto/foto) no WhatsApp; a IA gera **headline + release + post de
Instagram**; a comunicação **revisa, edita e publica** por este painel.

Multi-tenant: cada prefeitura acessa apenas os seus próprios dados. Há também um
painel de **administrador** com a visão de todas as prefeituras.

## Stack

- **Next.js 16** (App Router — API e telas no mesmo projeto)
- **Drizzle ORM + libSQL/SQLite** (arquivo local em dev, Turso em produção)
- **Autenticação própria** — sessão em cookie httpOnly assinado (HMAC) + bcrypt
- **Tailwind CSS**, **lucide-react**

## Rodando localmente

```bash
npm install
cp .env.example .env      # e preencha AUTH_SECRET / WEBHOOK_SECRET
npm run seed              # cria as tabelas e popula dados de demonstração
npm run dev               # http://localhost:3000
```

### Logins de demonstração (após `npm run seed`)

| Perfil | E-mail | Senha |
| --- | --- | --- |
| Administrador | `peeterlee@gmail.com` | `admin123` |
| Comunicação — Itapema | `comunicacao@itapema.sc.gov.br` | `itapema123` |
| Comunicação — Balneário | `comunicacao@balneario.sc.gov.br` | `balneario123` |

> Troque essas senhas antes de qualquer uso real.

## Estrutura

```
app/
  login/                 tela de login
  app/                   painel da comunicação (guard: papel "comunicacao")
  admin/                 painel do administrador (guard: papel "admin")
  api/
    auth/login|logout    autenticação
    app/data             dados da prefeitura logada
    releases/[id]        editar/mudar status/excluir release
    secretarios          cadastro de secretários (CRUD)
    contexto             anamnese da cidade (GET/PUT)
    admin/overview       visão geral (admin)
    webhook/ingest       Make grava um release gerado
    webhook/media        Make entrega uma foto do secretário
lib/
  db/schema.ts           modelo de dados (Drizzle)
  auth.ts                sessão, hash de senha, guarda
scripts/seed.mjs         cria tabelas + dados de demonstração
```

## Integração com o Make (substitui a planilha)

O Make identifica a prefeitura pelo **telefone do secretário** (cadastro) e grava
direto no banco. Header obrigatório em ambos: `x-webhook-secret: <WEBHOOK_SECRET>`.

**Novo release** — `POST /api/webhook/ingest`

```json
{ "telefone": "5547999999999", "origem": "audio",
  "transcricao": "...", "headline": "...", "release": "...", "instagram": "..." }
```

**Foto do secretário** — `POST /api/webhook/media`

```json
{ "telefone": "5547999999999", "url": "https://...", "legenda": "..." }
```

Se houver um release recente (< 2h) do secretário, a foto é anexada a ele.
Senão, é criado um item **"aguardando assunto"** e o `askMsg` de resposta ao
secretário é retornado.

## Produção

- Banco: criar um banco no **Turso** e definir `DATABASE_URL` + `DATABASE_AUTH_TOKEN`.
- Rodar o seed uma vez (ou criar as tabelas via Drizzle) e cadastrar a prefeitura real.
- Definir `AUTH_SECRET` e `WEBHOOK_SECRET` fortes no ambiente.
