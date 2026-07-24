# Auditoria da automação Make — "Motor de Autoridade · Radar → Entrega"

> Auditoria feita em 24/07/2026 a partir do blueprint real do cenário (via API do Make).
> Cenário ID **5722991** · Team 2430669 · Zona `us2.make.com` · **Ativo**.

## Agendamento

- Roda **segunda a sexta**, na janela **07:00–07:01** (intervalo interno de 900 s — na prática, 1 execução por dia útil).
- Sem webhook de entrada (`hookId: null`): o cenário é 100 % agendado; ninguém dispara o fluxo de fora.

## Módulos (fluxo completo)

| # | Módulo | O que faz |
|---|--------|-----------|
| 1 | `util:SetVariable2` (`listBody`) | Monta o envelope JSON `{"action":"list_clients","idempotency_key":"list-YYYY-MM-DD-HH-mm","payload":{}}` |
| 2 | `http:ActionSendData` | `POST https://projetos-ukf9.vercel.app/api/make` com o envelope acima. Autenticação por header `x-motor-secret` (valor = `MAKE_WEBHOOK_SECRET`, **redigido nesta doc**) |
| 3 | `builtin:BasicFeeder` (Iterator) | Itera `{{2.data.clients}}` — um bundle por cliente ativo e com onboarding concluído |
| 4 | `anthropic-claude:createAMessage` | Modelo `claude-sonnet-4-5-20250929`, `max_tokens` 1500. Prompt: "radar editorial", recebe `user_id` + `context` (string curta com temas, tom e público) e devolve **apenas JSON** com `title/theme/reason/editorial_angle/recommended_format/relevance_score/estimated_duration` |
| 5 | `util:SetVariable2` (`requestBody`) | Monta `{"action":"deliver_opportunity","idempotency_key":"{{sha256(resposta)}}","payload":<JSON da IA>}`. Remove cercas ```` ```json ```` da resposta com `replace` + `trim` |
| 6 | `http:ActionSendData` | `POST /api/make` de novo, entregando a oportunidade no app |

## Webhooks e endpoints

- **Webhooks Make:** nenhum.
- **Endpoint único do app:** `POST /api/make` (Vercel), com dois usos: `list_clients` e `deliver_opportunity`.
- **Autenticação:** header fixo `x-motor-secret` (a verificação HMAC `x-motor-signature` existe no app, mas o cenário usa o segredo fixo). ⚠️ O segredo fica em texto claro dentro do blueprint do Make — qualquer pessoa com acesso ao cenário o enxerga. Se vazar, gire o `MAKE_WEBHOOK_SECRET` na Vercel e atualize os 2 módulos HTTP.
- **Idempotência:** módulo 2 usa chave por minuto (`list-<timestamp>`); módulo 6 usa `sha256` do texto da resposta da IA — re-execuções com a mesma resposta não duplicam a entrega.

## Como a pauta chega ao cliente

1. `list_clients` devolve `{ user_id, name, context }` por cliente — `context` é uma frase montada pelo app com `main_themes`, `tone_of_voice` e `target_audience` do perfil.
2. A Claude gera **uma** oportunidade por cliente a partir só desse contexto.
3. `deliver_opportunity` grava em `daily_opportunities` (status `delivered`), cria `deliveries` (canal `in_app`) e o evento `conteudo_entregue`. A tela "Hoje" lê daí.

## Fontes consultadas — achado principal da auditoria

**Nenhuma.** O cenário não tem módulo de RSS, notícia, busca ou scraping. A pauta nasce exclusivamente do conhecimento paramétrico da Claude + o contexto curto do cliente. Consequências:

- Não há "radar" de fato: a pauta não reage a notícias do dia.
- Não existe escolha nem priorização de fontes — não há fontes.
- Clientes com contexto parecido tendem a receber pautas parecidas (viola a Regra nº 1 do produto).

## Como evoluir (já suportado pelo app após esta atualização)

O endpoint `/api/make` agora expõe ações pensadas para o cenário evoluir sem mudar a arquitetura:

- `list_clients` — passou a devolver também `segment`, resumo do **DNA Editorial** e os títulos das **pautas recentes** do cliente (para a IA não repetir a si mesma nem repetir outro cliente).
- `get_briefing` (`{user_id}`) — briefing completo: DNA Editorial, contexto, fontes priorizadas do cliente, fontes do segmento, referências de inspiração e pautas recentes.
- `get_sources` (`{user_id}`) — lista de fontes na ordem de prioridade: fontes do próprio cliente (alta > média > baixa) antes da matriz do segmento; inclui a lista de fontes bloqueadas.
- `deliver_opportunity` — agora **recusa** pauta com título idêntico ao entregue a outro cliente nos últimos 14 dias (resposta `{"accepted":false,"reason":"duplicate_across_clients"}`), registrando o caso em `system_errors` para aparecer no admin. O cenário deve tratar essa resposta gerando um novo ângulo.

Fluxo recomendado para a próxima versão do cenário: `list_clients` → por cliente `get_briefing` → (opcional) buscar RSS das fontes priorizadas → Claude com o briefing completo → `deliver_opportunity` (repetir com novo ângulo se `accepted:false`).
