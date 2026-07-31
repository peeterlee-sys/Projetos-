# RADAR PÚBLICO — Envio de mensagens/alertas (handoff técnico completo)

> Tudo o que foi levantado sobre a **parte de envio de alertas por WhatsApp**:
> arquivos, funções, rotas da API, tabelas do banco, variáveis de ambiente,
> a lógica de "quem recebe" e as decisões em aberto. Feito para abrir um chat
> dedicado só a esse tema.
>
> **Versão do código analisada:** branch `claude/busy-mccarthy-qsdv6d` (a versão
> nova, com roteamento por cidade/áudio/custo). ⚠️ Essa versão **ainda NÃO está
> implantada** no servidor — o droplet roda código antigo e divergente (a API do
> servidor responde **401**, mas o código do repositório **não tem auth**).

---

## 1. Infraestrutura (do manual do cliente)

| Item | Valor |
|---|---|
| Servidor | DigitalOcean, IP `147.182.211.211` |
| Pasta | `/root/projetos-/porta-voz` |
| Serviço | systemd `porta-voz.service` → `venv/bin/python run.py`, `localhost:8000` |
| Banco | SQLite `/root/projetos-/porta-voz/porta_voz.db` |
| Config | `/root/projetos-/porta-voz/.env` |
| Domínio | `radarpublico.ia.br` (mesmo droplet) |
| Provedor WhatsApp | **Z-API** (não-oficial) |

---

## 2. Arquivos que importam para o envio

| Arquivo | Papel |
|---|---|
| `src/alerts/whatsapp.py` | **Envio via Z-API.** Funções `send_text`, `send_audio`, `send_to_recipients`, `send_audio_to_recipients`, `filter_by_urgency`. |
| `src/alerts/formatter.py` | Monta o texto do alerta (`format_alert_message`) e o aviso operacional (`format_operational_message`). |
| `src/scheduler/monitor_job.py` | **Orquestra tudo.** Resolve destinatários (`_get_recipients`), envia texto+áudio (`_send_alert_with_audio`), descobre orgs assinantes (`_get_subscriber_org_ids`) e a cidade (`_get_city_filter`). |
| `src/analyzer/city_router.py` | `decide_routing()` — decide se o alerta é pertinente à cidade contratada (send/review/block). |
| `src/core/models.py` | Modelos `AlertRecipient`, `Organization`, `StationSubscription`, `Alert`, `Program`. |
| `src/core/config.py` | `settings` — lê `.env`, monta as URLs da Z-API. |
| `src/core/costs.py` | `estimate_whatsapp_cost` (custo estimado por mensagem). |
| `src/api/routes/organizations.py` | Rotas de CRUD de **destinatários** (recipients). |
| `src/api/routes/subscriptions.py` | Rotas de **assinatura de rádio** por org com `city_filter`. |
| `src/api/schemas.py` | `RecipientCreate/Out`, `SubscriptionCreate/Out`. |
| `migrations/versions/0001_initial_schema.py` | Cria tabelas `alert_recipients`, `organizations`, `programs`, etc. |
| `migrations/versions/0004_city_routing_audio_health.py` | Colunas novas de cidade/áudio/custo no `alerts` e `analyses` (aditiva, reversível). |
| `scripts/setup_balneario_camboriu.py` | Exemplo completo de setup de 1 cidade (org+rádio+programa+keywords+destinatário). |
| `scripts/setup_clientes_multicidade.py` | **Criado nesta conversa:** cria 1 org por cidade + destinatários (telefones em branco). |
| `.env.example` | Modelo de todas as variáveis. |
| `docs/ENVIO-ALERTAS-WHATSAPP.md` | Resumo de decisão (Z-API x Meta). |
| `docs/DEPLOY-SEGURO-RADAR-PUBLICO.md` | Runbook de deploy seguro da versão nova. |

---

## 3. Rotas da API (base `http://localhost:8000/api/v1`)

**Destinatários de alerta:**
- `GET  /organizations/{org_id}/recipients` — lista destinatários da org.
- `POST /organizations/{org_id}/recipients` — cria destinatário. Body:
  `{ "name": "...", "phone": "5547999998888", "urgency_filter": "low" }`
- `DELETE /organizations/{org_id}/recipients/{recipient_id}` — desativa (soft-delete).

**Organizações / rádios / programas / keywords:**
- `POST /organizations/` — `{name, city, state, plan, settings:{city_context:{...}}}`
- `POST /stations/` — `{org_id, name, city, state, stream_url, youtube_url, stream_type, is_active}`
- `POST /programs/` — `{station_id, name, days_of_week[], start_time, end_time, timezone, is_active, alert_recipients[]}`
- `POST /keywords/` — `{org_id, term, weight}`

**Assinaturas (rádio compartilhada por várias cidades):**
- `POST /subscriptions/` — `{station_id, org_id, city_filter}` ← **`city_filter` é o que define a cidade contratada quando a rádio é compartilhada.**
- `GET /subscriptions/`, `DELETE /subscriptions/{id}`

**Controle de monitoramento:**
- `POST /programs/{program_id}/monitor/start`
- `POST /programs/{program_id}/monitor/stop`
- `GET  /programs/{program_id}/monitor/status`

**Observabilidade:**
- `GET /alerts/` e `GET /alerts/{alert_id}` — alertas gerados/enviados.
- `GET /health/stations` — status das rádios (só na versão nova).
- `GET /health/costs` — custo estimado por org (só na versão nova).
- `GET /health` (raiz) — `active_monitoring_jobs`.

⚠️ **No servidor atual essas rotas retornam 401** (auth que não existe no repositório).
Enquanto isso não for resolvido, cadastre destinatários **por SQL** (seção 6).

---

## 4. Banco de dados — tabelas do envio

**`alert_recipients`** (destinatários — desde a migração 0001):
| coluna | tipo | nota |
|---|---|---|
| `id` | String (uuid) | PK |
| `org_id` | String | FK → organizations |
| `name` | String(100) | rótulo |
| `phone` | String(20) | **`5547999998888`** (55+DDD+número) |
| `is_active` | Boolean | soft-delete |
| `urgency_filter` | String(20) | urgência mínima p/ receber (`low`/`medium`/`high`/`critical`) |
| `created_at` | DateTime | |

**`organizations`**: `id, name, city, state, plan, is_active, settings(JSON), created_at, updated_at`.
`city` vira a **cidade contratada** (fallback quando não há `city_filter` na assinatura).
`settings.city_context` alimenta o contexto da análise Claude (prefeito, secretários, bairros…).

**`station_subscriptions`**: `id, station_id, org_id, city_filter, is_active, created_at`.
Permite várias orgs monitorarem a mesma rádio; `city_filter` = cidade daquela org.

**`programs`**: tem coluna `alert_recipients` (JSON) — override de destinatários por programa.

**`alerts`** (registro de cada alerta; colunas novas da 0004):
`recipients(JSON)`, `contracted_city`, `detected_city`, `routing_decision`,
`routing_reason`, `clip_file_path`, `audio_status`, `audio_url`,
`estimated_cost_usd`, `status`, `sent_at`, `error_message`.

---

## 5. Lógica de envio — como funciona de ponta a ponta

### 5.1. Quem recebe (`monitor_job._get_recipients`)
Ordem de prioridade:
1. **`programs.alert_recipients`** (JSON no programa) — se preenchido, **só ele vale**.
2. **Tabela `alert_recipients`** da org, filtrada por urgência (`filter_by_urgency`). ← recomendado.
3. **`.env DEFAULT_ALERT_RECIPIENTS`** — fallback global.

> Os destinatários são buscados **só por `org_id` — NÃO há filtro por cidade dentro
> da org.** Logo, para "cada responsável recebe só a sua cidade", modele **1
> organização por cidade** (cada org com sua `city` e seus números). Todos os
> números de uma org recebem todos os alertas daquela org.

### 5.2. Urgência (`filter_by_urgency` + `ALERT_URGENCIES`)
- O sistema **só dispara alertas de urgência `high` ou `critical`** (`ALERT_URGENCIES = {"critical","high"}`). Os `low`/`medium` não são enviados.
- Ordem: `low < medium < high < critical`. O destinatário recebe se
  `urgency_filter <= urgência do alerta`. Ou seja: `urgency_filter="low"` (ou `"high"`)
  → recebe **todos** os alertas enviados; `"critical"` → só os críticos.

### 5.3. Roteamento por cidade (`city_router.decide_routing`)
- Entrada: `contracted_city` (= `subscription.city_filter` **ou** `org.city`),
  `primary_city`, `affected_cities`, `city_confidence` (limiar `MIN_CITY_CONFIDENCE`, default **0.75**).
- Decisões: **send** (cidade principal/afetada == contratada e confiança ok),
  **review** (confiança baixa ou cidade indefinida → retém p/ revisão), **block**
  (assunto de outra cidade). Evita "alerta de BC indo pra Itapema".

### 5.4. Envio (`_send_alert_with_audio` → `whatsapp.py`)
1. **Texto** imediatamente via `send_to_recipients` (retry até 2x por número,
   backoff `2**attempt`). Marca alerta `sent`/`failed`.
2. **Áudio completo** do trecho via `send_audio_to_recipients` (base64 data-URI).
   Se o arquivo passar de `MAX_AUDIO_MB` (15MB) ou falhar, manda um **texto com link**
   (`{PUBLIC_BASE_URL}/api/v1/clips/{transcription_id}`) e marca `audio_status=link_only`.
   ⚠️ **Atenção:** não encontrei uma rota `/clips/...` servindo o áudio no código —
   o link só funciona se `PUBLIC_BASE_URL` estiver setado E existir essa rota.
   **Verificar antes de prometer "ouça o áudio completo" ao cliente.**
- Envio é **1 mensagem privada por número** — **não** é grupo de WhatsApp.

### 5.5. Z-API — como conecta (`config.py`)
- Variáveis: `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN`, `ZAPI_BASE_URL` (`https://api.z-api.io`).
- URLs montadas:
  `…/instances/{ID}/token/{TOKEN}/send-text` e `…/send-audio`.
- Header extra: `Client-Token: {ZAPI_CLIENT_TOKEN}`.
- Se `ZAPI_INSTANCE_ID`/`ZAPI_TOKEN` vazios → não envia (loga `whatsapp.not_configured`).

---

## 6. Cadastro de destinatários por SQL (plano confiável no servidor atual)

Porque a API do servidor retorna 401. Rodar em `/root/projetos-/porta-voz`:

```bash
# listar orgs e destinatários atuais
python3 - <<'EOF'
import sqlite3
db=sqlite3.connect('porta_voz.db')
print("== ORGS =="); [print(o) for o in db.execute("SELECT id,name,city FROM organizations")]
print("== RECIPIENTS =="); [print(r) for r in db.execute("SELECT org_id,name,phone,is_active,urgency_filter FROM alert_recipients")]
EOF

# adicionar números a uma org
python3 - <<'EOF'
import sqlite3, uuid
from datetime import datetime
ORG_ID="COLE_O_ORG_ID"
NUMEROS=[("Nome 1","5547999990001"),("Nome 2","5547999990002")]
db=sqlite3.connect('porta_voz.db')
for nome,tel in NUMEROS:
    db.execute("INSERT INTO alert_recipients (id,org_id,name,phone,is_active,urgency_filter,created_at) VALUES (?,?,?,?,1,'low',?)",
               (uuid.uuid4().hex,ORG_ID,nome,tel,datetime.utcnow().isoformat()))
db.commit(); print(f"{len(NUMEROS)} adicionados")
EOF

systemctl restart porta-voz.service
```

---

## 7. Custos de envio

- **Z-API:** instância mensal (precisa estar conectada/paga). Sem custo por mensagem.
- **Meta Cloud API (se migrar):** cobrança por mensagem/conversa, categoria "utility".
  `costs.py::estimate_whatsapp_cost` já registra custo estimado por alerta (`alerts.estimated_cost_usd`).
- Dependências para o alerta acontecer: **Anthropic** (análise; sem crédito, transcreve
  e não gera alerta → gasta Whisper à toa), **OpenAI/Whisper** (US$ 0,006/min), **Z-API**.

---

## 8. Decisão em aberto: Z-API vs. API oficial da Meta (Cloud API)

**Z-API (atual):** barata, manda áudio livre, boa p/ demo. **Não-oficial → número
pode ser banido sem aviso, sem SLA.** Risco reputacional com prefeitura.

**Meta Cloud API (recomendada p/ produção):**
- Oficial, estável, com SLA, selo verificado.
- Exige: **número dedicado** (não pode estar num WhatsApp normal); verificação de
  negócio (CNPJ); **templates aprovados** (categoria "utility") para mensagens
  iniciadas pela empresa; áudio fora da janela de 24h exige template com header de mídia.
- Custo por mensagem/conversa (confirmar tabela vigente p/ Brasil).
- Contratar direto pela Meta Cloud API ou via BSP (360dialog, Twilio, Gupshup).

**Mudança de código p/ migrar** (contida — `whatsapp.py` é isolado):
1. Novas configs (`WABA_ID`, `PHONE_NUMBER_ID`, token permanente).
2. Endpoint `graph.facebook.com/v.../{PHONE_NUMBER_ID}/messages`.
3. Payload por **template** (variáveis: cidade, tema, rádio, hora).
4. Fluxo de mídia p/ áudio (upload → `media_id` → envio).
5. Aprovar templates na Meta antes de produção.

---

## 9. Regras que não podem falhar (checklist)

- [ ] Telefone no formato `55` + DDD + número, **sem `+`, espaço ou traço** (ex.: `5547999998888`). Formato errado = **falha silenciosa**.
- [ ] Para "responsável por cidade": **1 org por cidade** (destinatários não são filtrados por cidade dentro de uma org).
- [ ] `urgency_filter = "low"` (ou `"high"`) para receber todos os alertas enviados.
- [ ] Confirmar que nenhum `programs.alert_recipients` está preenchido (senão ignora a tabela).
- [ ] Alinhar com o cliente: **mensagem privada por pessoa** (o que o sistema faz) vs. grupo de WhatsApp.
- [ ] Verificar se a rota `/clips/{id}` existe antes de prometer "ouça o áudio completo".
- [ ] Testar **1 disparo real** e confirmar que **cada número** recebeu texto **e** áudio.

---

## 10. Perguntas para o chat dedicado

1. Modelar as N cidades como N organizações (recomendado) ou alterar o código para
   filtrar destinatário por cidade dentro de uma org?
2. Cliente quer mensagem privada por pessoa ou grupo de WhatsApp?
3. Migrar para Meta Cloud API já na estreia ou demos na Z-API + migração antes de produção?
4. Quem provê o número dedicado e faz a verificação de negócio (CNPJ) na Meta?
5. Formato dos templates de alerta (texto + variáveis) para aprovação.
6. Resolver a divergência do servidor (401) e implantar a versão nova (ver
   `docs/DEPLOY-SEGURO-RADAR-PUBLICO.md`) antes de qualquer produção.
