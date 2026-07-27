# Assessor 24h — operação própria, mesma engenharia

O **Assessor 24h** (mandatos) e o **Take** (profissionais) são produtos
distintos rodando a mesma base de código, cada um no seu deploy: domínio
próprio, banco próprio, clientes próprios, marca própria. Nada que se faça em
um alcança o outro — o Take segue operando como está.

Este documento cobre (1) como subir a operação do Assessor 24h e (2) a virada
do fluxo antigo: sai o Google Form + duas planilhas, entra a anamnese web +
Postgres, com o cenário do WhatsApp buscando no banco.

## 0. Subir a operação do Assessor 24h

Um deploy novo, do mesmo repositório:

1. **Banco** — crie um projeto Supabase separado (ex.: `assessor24h`) e rode
   `supabase/setup.sql` nele. Banco próprio significa que nenhum cliente do
   Take aparece no painel do Assessor 24h, e vice-versa.
2. **Deploy** — na Vercel, *Add New → Project* apontando para o **mesmo
   repositório** (`motor-autoridade`). É um segundo projeto, não um segundo
   branch: os dois acompanham a mesma `main` e recebem as mesmas correções.
3. **Variáveis de ambiente** do projeto novo:

   | Variável | Valor |
   | --- | --- |
   | `NEXT_PUBLIC_BRAND` | `assessor24h` |
   | `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | do projeto Supabase novo |
   | `SUPABASE_SERVICE_ROLE_KEY` | do projeto Supabase novo |
   | `MAKE_WEBHOOK_SECRET` | um segredo **diferente** do Take |
   | `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | pode ser a mesma chave |

   No projeto do Take **não mexa em nada**: sem `NEXT_PUBLIC_BRAND`, ele
   continua sendo o Take, com o banco dele.
4. **Domínio** — `assessor24h.ia.br` no projeto novo (seção 4).
5. **Seu acesso de admin** — cadastre-se normalmente em
   `assessor24h.ia.br/signup` e depois promova a conta no SQL Editor do
   Supabase novo:

   ```sql
   update public.users
      set role = 'super_admin', is_active = true
    where email = 'seu@email.com';
   ```

   `super_admin` enxerga todos os mandatos, independente de tenant. Faça isso
   **antes** de importar as planilhas — é assim que você entra no painel e
   aprova os cadastros dos vereadores.

O que a marca muda: nome e logotipo, título e PWA, textos da landing, persona
dos prompts de IA e a trilha de anamnese — no Assessor 24h, `/onboarding` já
abre direto no questionário do mandato, sem passar pelo wizard genérico.
Tudo o mais (motor de pautas, DNA, teleprompter, painel, `/api/make`) é o mesmo
código nos dois.

## O que mudou

| Antes | Depois |
| --- | --- |
| Google Form de anamnese | Wizard web em `/onboarding/politico` (8 etapas) |
| Planilha "Nomes" (A–F) | `client_profiles` (trilha `political`) |
| Planilha "Respostas do Formulário" | campos estruturados de `client_profiles` |
| Cenário Make "Anamnese → Planilha de Nomes" | **deletado** — o wizard grava direto no banco |
| Busca em planilha no assistente | `POST /api/make` com `action: "get_vereador"` |
| Anamnese em texto livre | DNA Editorial (JSON) gerado por IA ao fim do wizard |

## 1. Banco de dados

No banco do Assessor 24h, `supabase/setup.sql` já inclui tudo. Num banco que
já existia (ex.: se você optar por reaproveitar um), aplique só a migration
nova:

```bash
supabase db push          # ou: psql "$DATABASE_URL" -f supabase/migrations/0009_anamnese_politica.sql
```

O que ela cria:

- colunas de mandato em `client_profiles` — `phone`, `political_name`, `party`,
  `mandate`, `positions[]`, `political_spectrum`, `flags[]` (bandeiras),
  `electoral_base`, `voter_profile`, `slang_expressions[]`, `emojis[]`,
  `how_to_refer`, `catchphrase`, `adversaries[]`, `mayor_relation`,
  `history_to_avoid`, `instagram_url`, `website_url`,
  `reference_publications[]`, `local_press[]`, `local_context`,
  `audience_segments[]`, `profile_track`, `last_generation_at`;
- índice único em `phone` — um telefone pertence a um único mandato;
- tabela `legacy_vereadores` — staging da importação das planilhas;
- `build_contexto_mestre` v3 — passa a incluir o bloco `mandato`;
- fontes de segmento `vereadores` na matriz.

RLS: `client_profiles` continua com a política existente (o vereador só vê o
próprio registro; admin vê os do tenant; super vê tudo). `legacy_vereadores` é
visível apenas para admin/super — a `/api/make` acessa via `service_role`.

## 2. Importar as duas planilhas

Exporte cada aba como CSV e rode:

```bash
# confira antes de gravar
node scripts/import-planilhas.mjs --nomes nomes.csv --respostas respostas.csv --dry-run

# grava em legacy_vereadores
export NEXT_PUBLIC_SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
node scripts/import-planilhas.mjs --nomes nomes.csv --respostas respostas.csv
```

O script casa os dois arquivos **pelo telefone**, ignorando o 9º dígito (o mesmo
celular aparece como `554799184838` numa planilha e `5547991848380` na outra).
Da planilha de nomes ele lê as colunas na ordem A–F (Phone, Nome, Partido,
Cidade, Contexto, Perfil); das respostas ele guarda o formulário inteiro em
`form_answers` e tenta identificar telefone, nome, nome político, partido e
cidade pelo texto do cabeçalho.

O resultado aparece em **/admin/vereadores**. Enquanto o vereador não preenche o
wizard, o assistente responde com esses dados (`source: "legacy"`). Quando ele
conclui a anamnese, o registro é vinculado automaticamente pelo telefone e o
assistente passa a usar o perfil vivo (`source: "app"`).

## 3. Make: o que deletar e o que adaptar

| Cenário | Ação |
| --- | --- |
| "Anamnese → Planilha de Nomes" | **Deletar.** O wizard web grava direto no Postgres. |
| "MEU ASSESSOR - IA" | **Adaptar** (abaixo). |
| Demais fluxos que não leem as planilhas | Manter. |

Antes de deletar, exporte o blueprint do cenário (Make → ⋯ → Export Blueprint) e
guarde os CSVs das planilhas — backup barato, arrependimento caro.

### Adaptação do "MEU ASSESSOR - IA"

Troque o módulo **Google Sheets → Search Rows** por **HTTP → Make a request**:

- **URL**: `https://assessor24h.ia.br/api/make`
- **Method**: `POST`
- **Headers**: `x-motor-secret: $MAKE_WEBHOOK_SECRET`
  (ou assine o corpo com HMAC e mande em `x-motor-signature` — a rota aceita os dois)
- **Body type**: Raw · JSON
- **Parse response**: Yes

```json
{
  "action": "get_vereador",
  "idempotency_key": "{{1.messageId}}",
  "payload": { "phone": "{{1.phone}}" }
}
```

> `idempotency_key` precisa ser único por requisição (mínimo 8 caracteres). Use o
> id da mensagem do WhatsApp; repetir a chave devolve `{"status":"duplicate"}`
> sem reprocessar.

Resposta (200):

```json
{
  "status": "ok",
  "found": true,
  "source": "app",
  "vereador": {
    "user_id": "…",
    "name": "José Carlos Souza",
    "political_name": "Zé do Bairro",
    "phone": "5547991848380",
    "city": "São José", "state": "SC", "party": "PSD",
    "mandate": "2º (2025–2028)", "positions": ["Presidente da Comissão de Saúde"],
    "political_spectrum": "centro", "flags": ["Saúde na periferia", "Mobilidade"],
    "electoral_base": "…", "voter_profile": "…", "local_context": "…",
    "tone_profile": ["Popular e próximo"], "slang_expressions": ["meu povo"],
    "emojis": ["💪"], "how_to_refer": "Vereador Zé", "catchphrase": "…",
    "forbidden_themes": ["…"], "adversaries": ["…"],
    "mayor_relation": "Independente", "history_to_avoid": "…",
    "local_press": ["Rádio Cidade AM"],
    "editorial_dna": { "identidade": "…", "pilares": ["…"], "estilo_verbal": "…", "angulo_unico": "…" },
    "contexto_mestre": { … },
    "fontes": [{ "kind": "site", "name": "Rádio Cidade", "priority": "high" }],
    "fontes_bloqueadas": ["…"],
    "pautas_recentes": [{ "title": "…" }],
    "anamnese_pendente": false
  }
}
```

Casos que o cenário precisa tratar:

- `found: false`, `reason: "nao_cadastrado"` → número desconhecido: responda com a
  mensagem de boas-vindas e o link do wizard;
- `found: false`, `reason: "telefone_invalido"` → número fora do padrão brasileiro;
- `source: "legacy"` → vereador ainda sem conta: os campos vêm de
  `perfil_texto` + `respostas_formulario`, e `anamnese_pendente: true`.

No módulo do Claude, mande o `editorial_dna` inteiro no system prompt — ele já
traz identidade, bandeiras, estilo verbal, limites e o ângulo único do mandato.
Os campos `forbidden_themes`, `adversaries` e `history_to_avoid` são regras
absolutas: repita-as explicitamente como proibições.

### Demais ações disponíveis em `/api/make`

| `action` | Payload | Uso |
| --- | --- | --- |
| `get_vereador` | `{phone}` ou `{user_id}` | perfil do mandato + DNA (assistente de WhatsApp) |
| `list_clients` | `{tenant_id?}` | varredura diária: agora traz `phone`, `party`, `city`, `track` |
| `get_briefing` | `{user_id}` | DNA + fontes + referências + pautas recentes |
| `get_radar` | `{user_id}` | manchetes reais do dia para o cliente |
| `get_sources` | `{user_id}` | fontes do cliente na ordem de prioridade |
| `deliver_opportunity` | pauta | entrega a pauta no app (recusa título duplicado em 14 dias) |
| `register_error` | `{scope, message, context?}` | registra falha do cenário para o admin |

## 4. Domínio e links do produto

Tudo sob `assessor24h.ia.br`. Os dois links do dia a dia são curtos de propósito
— um para o vereador, um para você:

| Link | Quem usa | O que é |
| --- | --- | --- |
| **`assessor24h.ia.br/anamnese`** | vereador | anamnese em 8 etapas (→ `/onboarding/politico`) |
| **`assessor24h.ia.br/painel`** | você / equipe | dashboard administrativo (→ `/admin`) |
| `assessor24h.ia.br/painel` → aba *Vereadores* | você / equipe | mandatos + importados das planilhas |
| `assessor24h.ia.br/hoje` | vereador | app do dia a dia (pauta, roteiro, teleprompter) |
| `assessor24h.ia.br/api/make` | Make | endpoint autenticado do assistente |

Os dois links curtos sobrevivem ao login: sem sessão, o visitante passa por
`/login?next=…` (com "Criar conta" preservando o destino) e volta exatamente
para onde clicou — o vereador nunca cai na anamnese genérica, e você nunca cai
no app de cliente ao abrir o painel. O `/painel` só abre para `admin` e
`super_admin`; qualquer outro papel é mandado para `/hoje`.

Variantes úteis do link do vereador:

| Link | Para quem |
| --- | --- |
| `https://assessor24h.ia.br/anamnese` | link padrão, serve para todos |
| `https://assessor24h.ia.br/signup?next=/anamnese` | vereador novo, vai direto ao cadastro |
| `https://assessor24h.ia.br/anamnese?refazer=1` | quem já respondeu e vai atualizar |

### Configurar o domínio (uma vez)

1. **Vercel** → projeto → Settings → Domains → adicionar `assessor24h.ia.br`
   (e `www.assessor24h.ia.br` redirecionando para o apex).
2. **DNS do registro.br** → apontar conforme a Vercel indicar: `A` do apex para
   `76.76.21.21` e `CNAME` do `www` para `cname.vercel-dns.com`. A Vercel emite
   o certificado TLS sozinha depois da propagação.
3. **Supabase** → Authentication → URL Configuration:
   - *Site URL*: `https://assessor24h.ia.br`
   - *Redirect URLs*: `https://assessor24h.ia.br/auth/callback`
   Sem isso o e-mail de confirmação volta para o domínio antigo.
4. **Make** → trocar a URL do módulo HTTP para
   `https://assessor24h.ia.br/api/make`.

Nada disso está no código: o app não tem URL fixa em lugar nenhum, monta os
links a partir do domínio em que está rodando. Trocar de domínio não exige
deploy.

### Aprovação de cadastro

Conta nova de cliente nasce **pendente** (`is_active = false`): o vereador cria
a conta pelo link, cai na tela "Cadastro em análise" e só chega à anamnese
depois que você aprova em **/admin** (bloco "Cadastros pendentes"). É o que
impede qualquer pessoa com o link de entrar no sistema. Se preferir que o link
libere direto, é uma linha em `handle_new_auth_user` (0007) — mas aí o link
vira porta aberta.

### Mensagem pronta para o WhatsApp

> Vereador, agora a anamnese do Assessor 24h é por aqui:
> https://assessor24h.ia.br/anamnese
> São 8 etapas rápidas (uns 10 minutos). Ao terminar, a IA monta o DNA do seu
> mandato — é o que faz o assistente responder com a sua voz, suas bandeiras e
> seus limites. O formulário antigo do Google sai do ar.

## 5. Wizard da anamnese

`/onboarding/politico` — 8 etapas: Identificação, Posicionamento, Tom e estilo,
Limites, Referências, Influências, Preferências e Revisão. Ao enviar, o app:

1. valida tudo com Zod (telefone normalizado para `55DDDNÚMERO`);
2. recusa telefone já usado por outro mandato;
3. faz upsert em `client_profiles`, `client_preferences`, `influence_sources` e
   `inspiration_refs`;
4. reconstrói o `contexto_mestre`;
5. gera o **DNA Editorial político** com IA e grava em `editorial_dna`;
6. vincula o registro importado de mesmo telefone em `legacy_vereadores`;
7. marca `users.onboarded_at`.

Falha de IA na etapa 5 não trava a anamnese: fica registrada em `system_errors`
(escopo `ai`, visível no painel) e o DNA pode ser regerado refazendo a anamnese
em `/onboarding/politico?refazer=1`.

## 6. Painel administrativo

Acesso: **`assessor24h.ia.br/painel`** (atalho para `/admin`).

- **/admin** — cards (total, vereadores, com DNA, inativos, teste, cancelados),
  produção, alertas e a lista de clientes com mandato, meta semanal e
  **% do DNA preenchido**;
- **/admin/vereadores** — mandatos no app + registros importados das planilhas,
  com a situação de cada um;
- **/admin/clientes/[id]** — painel "Mandato" (identificação, base eleitoral,
  estilo verbal e limites absolutos), DNA Editorial completo, fontes,
  referências, histórico de pautas, publicações e logs de IA;
- **/admin/fontes** — matriz de fontes por segmento (inclui `vereadores`).

## 7. Checklist da virada

1. [ ] Criar o Supabase do Assessor 24h e rodar `supabase/setup.sql`.
2. [ ] Criar o projeto na Vercel (mesmo repo) com `NEXT_PUBLIC_BRAND=assessor24h`.
3. [ ] Apontar `assessor24h.ia.br` na Vercel + DNS e ajustar as URLs no Supabase.
4. [ ] Criar seu usuário admin no banco novo (`role = 'super_admin'`).
5. [ ] Exportar as duas planilhas em CSV (backup) e rodar o importador.
6. [ ] Conferir `assessor24h.ia.br/painel` → aba Vereadores.
7. [ ] Adaptar o cenário "MEU ASSESSOR - IA" para o `get_vereador`.
8. [ ] Testar ponta a ponta: um vereador preenche `/anamnese`, você aprova no
   painel, e o assistente responde por WhatsApp com o DNA novo.
9. [ ] Mandar o link para os vereadores e desativar o Google Form.
10. [ ] Rodar em paralelo alguns dias com as planilhas ainda de pé (backup vivo).
11. [ ] Funcionando: exportar o blueprint e deletar o cenário "Anamnese →
    Planilha de Nomes". A partir daqui a fonte de verdade é o banco.

## Variáveis de ambiente

| Variável | Uso |
| --- | --- |
| `NEXT_PUBLIC_BRAND` | `assessor24h` neste deploy; ausente/`take` no Take |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | app e wizard |
| `SUPABASE_SERVICE_ROLE_KEY` | `/api/make`, importador (ignora RLS no servidor) |
| `MAKE_WEBHOOK_SECRET` | autenticação da `/api/make`: header `x-motor-secret` **e** assinatura HMAC `x-motor-signature` |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | geração do DNA Editorial |
