# Assessor 24h — migração das planilhas para o app

Este documento é o passo a passo da virada: sai o Google Form + duas planilhas,
entra a anamnese web + Postgres. Ele cobre o que rodar, o que apagar no Make e
como adaptar o cenário do assistente de WhatsApp.

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

Aplique a migration nova (as anteriores já devem estar aplicadas):

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

- **URL**: `https://SEU-DOMINIO/api/make`
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

## 4. Wizard da anamnese

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

## 5. Painel administrativo

- **/admin** — cards (total, vereadores, com DNA, inativos, teste, cancelados),
  produção, alertas e a lista de clientes com mandato, meta semanal e
  **% do DNA preenchido**;
- **/admin/vereadores** — mandatos no app + registros importados das planilhas,
  com a situação de cada um;
- **/admin/clientes/[id]** — painel "Mandato" (identificação, base eleitoral,
  estilo verbal e limites absolutos), DNA Editorial completo, fontes,
  referências, histórico de pautas, publicações e logs de IA;
- **/admin/fontes** — matriz de fontes por segmento (inclui `vereadores`).

## 6. Checklist da virada

1. [ ] Aplicar `0009_anamnese_politica.sql`.
2. [ ] Exportar as duas planilhas em CSV (backup) e rodar o importador.
3. [ ] Conferir `/admin/vereadores`.
4. [ ] Adaptar o cenário "MEU ASSESSOR - IA" para o `get_vereador`.
5. [ ] Testar o assistente com um número real (perfil no app e perfil importado).
6. [ ] Exportar o blueprint e **deletar** o cenário "Anamnese → Planilha de Nomes".
7. [ ] Desativar o Google Form e avisar os vereadores do novo link.
8. [ ] Parar de editar as planilhas — a partir daqui a fonte de verdade é o banco.

## Variáveis de ambiente

| Variável | Uso |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | app e wizard |
| `SUPABASE_SERVICE_ROLE_KEY` | `/api/make`, importador (ignora RLS no servidor) |
| `MAKE_WEBHOOK_SECRET` | autenticação da `/api/make`: header `x-motor-secret` **e** assinatura HMAC `x-motor-signature` |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | geração do DNA Editorial |
