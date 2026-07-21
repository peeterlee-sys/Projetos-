# Diagnóstico Técnico — Motor de Autoridade (MVP)

> **Fase 1 — Auditoria.** Documento apresentado ANTES de qualquer alteração estrutural,
> conforme as regras de execução. Nenhum código de aplicação foi criado ainda.
> Data: 2026-07-21 · Branch: `claude/editorial-intelligence-mvp-r3hofw`

---

## 0. Resumo executivo

O repositório `Projetos-` é um **monorepo com três projetos independentes** que já cobrem,
de forma fragmentada, boa parte dos pilares do Motor de Autoridade:

| Projeto | Stack | O que resolve | Relevância p/ o MVP |
|---|---|---|---|
| `porta-voz` | Python 3 · FastAPI · SQLAlchemy · Claude API · Whisper | Radar/monitoramento de mídia, análise por IA com JSON estruturado, alertas, relatórios, multi-tenant | **Alta** — é o "radar de tendências" e a camada de IA já provada |
| `ruah-crm` | Next.js 15 · React 19 · TS · Tailwind 4 · Drizzle · libSQL/Turso · NextAuth | Auth, rotas protegidas, CRUD, cron, WhatsApp/e-mail, migrações | **Alta** — padrões de frontend/auth/notificação reutilizáveis |
| `prefeitura-comunica` | Next.js 16 · React 19 · TS · Tailwind 4 · OpenAI SDK · Drizzle | Landing/prompts editoriais (Itapema) | Média — referência de prompts/conteúdo |

O **protótipo enviado** (`motor-app.html`, ~756 KB, + variantes) é um app single-file
funcional (estilo Preact/Framer) que **já define toda a IA de produto, o design system, a
voz da marca e o fluxo completo** — inclusive teleprompter com `MediaRecorder` e `getUserMedia`.
Ele é a **referência principal** de UX/UI e de copy.

**Conclusão:** não se trata de começar do zero. O MVP é a **consolidação** de um novo app
Next.js mobile-first/PWA que (a) herda o design e o fluxo do protótipo, (b) reutiliza padrões
do `ruah-crm`, e (c) consome/absorve a inteligência editorial do `porta-voz`.

---

## 1. O que já existe

### 1.1 `porta-voz` — o radar e a IA (reaproveitável quase inteiro no backend)
- **Multi-tenant real**: `Organization` (tenant), isolamento por `org_id` em keywords,
  alertas, análises, assinaturas (`StationSubscription`).
- **Camada de IA madura** (`analyzer/claude_analyzer.py`): cliente Anthropic async, `SYSTEM_PROMPT`
  + template de usuário, **saída 100% em JSON estruturado** (`is_relevant`, `confidence_score`,
  `theme`, `sentiment`, `urgency`, `content_type`, `summary`, `excerpt`, `reason`,
  `suggested_action`), registro de `raw_response` e `claude_duration_ms` (base para *cost logs*).
- **Deduplicação, filtro por keyword, scheduler** (`scheduler/job_manager.py`, `monitor_job.py`).
- **Relatórios** consolidados (`reports/generator.py`, modelo `Report` com timeline, key_topics,
  recommendations) — molde direto para o **Relatório Semanal (MÓDULO 10)**.
- **Alertas** WhatsApp com formatter e status (`alerts/`).
- Migrações Alembic versionadas; dashboard HTML estático (`api/static/dashboard.html`).

### 1.2 `ruah-crm` — padrões de app web (reaproveitável como referência de implementação)
- **Auth** com NextAuth (Credentials + bcrypt, sessão JWT) — `src/lib/auth.ts`.
- **Rotas protegidas** via `middleware.ts` (`withAuth`, matcher que libera `api/auth`, `api/webhook`, `api/cron`, `login`).
- **Rotas de API** organizadas (`app/api/**`), **webhook** WhatsApp, **cron protegido por `CRON_SECRET`**.
- **Camada de dados** com Drizzle + libSQL, **migrações versionadas** (`db/migrations`), schema tipado,
  `seed.ts`, script de criação de usuário.
- **Notificações** desacopladas (`lib/notifications/{index,email,whatsapp}.ts`).
- **Validação** com Zod (`lib/validation.ts`), utilidades de formatação.
- Tailwind 4, lucide-react, componentes (Kanban, drawer, modal) — padrão de UI reutilizável.

### 1.3 Protótipo `motor-app.html` — a fonte da verdade de produto
Já contém, funcionando em HTML/JS:
- **Onboarding editorial** ("Quantos conteúdos por semana?", tom, calibração do radar).
- **Tela Hoje / "Hoje no seu radar"** com estado de radar vazio ("não encontrou nada à sua altura").
- **Formatos**: Roteiro/Vídeo 60s, Carrossel (7 lâminas), Post estático, Story com enquete, LinkedIn.
- **Teleprompter + gravação**: `getUserMedia`, `MediaRecorder` (6 ocorrências), permissão de câmera,
  "Gravar com teleprompter", prévia ("Assista antes de publicar"), marcar publicado.
- **Meta semanal e progresso**: `fWeekDone/metaSemanal`, "Evolução — publicações por semana".
- **Relatório semanal** ("esta foi sua melhor semana", "você dobrou sua presença", domingo 20h).
- **Biblioteca**.
- **Voz comportamental sem culpa** (MÓDULO 8): "Nenhuma opção gera culpa", "Hoje está difícil?",
  "O tema vira carrossel. Mesma presença, sem câmera."

### 1.4 Design System extraído do protótipo (referência obrigatória)
**Tipografia**
- `Newsreader` — serifada, para títulos editoriais.
- `Instrument Sans` — sans-serif, para UI e corpo.

**Paleta** (por frequência de uso no protótipo)
| Papel | Cor |
|---|---|
| Verde floresta (primária) | `#1D4A38` · `#143627` · `#22352B` |
| Creme / areia (fundos) | `#FAF7F2` · `#F3EFE7` · `#E7E1D6` |
| Grafite (texto) | `#1C1A16` · `#57503F` |
| Taupe / neutros | `#6E675C` · `#9A927F` · `#D8D0C0` |
| Dourado (acento "autoridade") | `#A87B2F` · `#C9A94E` · `#E9C87B` |
| Alerta / vermelho | `#E04B3A` · `#B4482E` |
| Verde claro (sucesso/tags) | `#E8EFE9` |

Estética: **editorial, premium, quente** — fundo creme, verde profundo, acento dourado,
títulos serifados. Deve ser traduzida para **tokens Tailwind** (CSS variables + `tailwind.config`).

---

## 2. O que pode ser reutilizado

| Componente do MVP | Origem | Forma de reúso |
|---|---|---|
| Camada abstrata de IA + JSON estruturado + validação | `porta-voz/analyzer` | **Portar** o padrão para TS (provider abstrato Anthropic/OpenAI, Zod schema, retries, custo/tokens) |
| Modelo de Relatório Semanal | `porta-voz` `Report` | Adaptar estrutura (key_topics, timeline, recommendations) para relatório do cliente |
| Multi-tenant por `org_id` | `porta-voz` `Organization` | Conceito de `tenant_id`/`client_id` já validado; reimplementar com RLS no Postgres |
| Auth + middleware de rotas protegidas | `ruah-crm` | Padrão de proteção de rotas e sessão (adaptar ao provedor escolhido) |
| Cron protegido por segredo | `ruah-crm` `api/cron` | Reusar para geração diária de pautas e relatório semanal |
| Webhooks autenticados | `ruah-crm` `api/webhook` | Base para os endpoints do Make (MÓDULO 14) |
| Notificações desacopladas | `ruah-crm/lib/notifications` | Base para camada de notificação; **adicionar Web Push** |
| Validação Zod | `ruah-crm/lib/validation` | Reusar padrão em todos os inputs e nos payloads do Make/IA |
| Design + fluxo + copy | protótipo | **Referência principal** para telas, componentes e microcopy |

---

## 3. O que precisa ser criado

Um **novo app** `motor-autoridade/` (Next.js, mobile-first, PWA), sem tocar nos três projetos
existentes. Novos itens principais:

1. **Scaffold Next.js 15 (App Router) + React 19 + TS + Tailwind 4** com tokens do design system.
2. **PWA** (manifest, ícones, service worker, cache, offline limitado, update de versão).
3. **Banco de dados** com as ~28 tabelas do MÓDULO 15 (SQL, índices, constraints, timestamps,
   soft delete, RLS, auditoria, funções auxiliares).
4. **Auth + papéis** (`super_admin`, `admin`, `client`, `collaborator`) + onboarding obrigatório.
5. **Onboarding editorial** → `contexto_mestre` do cliente (MÓDULO 2).
6. **Tela Hoje**, **Formatos** (5), **Teleprompter/gravação local**, **Carrossel/Post por template**.
7. **Eventos comportamentais** + **motor de acompanhamento** (estímulos sem culpa).
8. **Metas, Progresso, Relatório Semanal, Biblioteca**.
9. **Notificações Web Push** + preferências/limites/níveis.
10. **Dashboard administrativo** + perfil por cliente.
11. **Endpoints Make** autenticados (assinatura, idempotency_key, logs, dedup).
12. **Camada de IA em TS** (provider abstrato, schema, retries, cost/token logging, limites).
13. **Testes** (unit/integração/e2e) cobrindo os módulos críticos.
14. **Documentação, deploy, manual admin, backlog futuro.**

---

## 4. Riscos técnicos

| # | Risco | Severidade | Mitigação |
|---|---|---|---|
| R1 | **Divergência de stack de dados**: spec pede Supabase/Postgres+RLS; repo usa libSQL/Turso+Drizzle+NextAuth. libSQL **não** tem RLS no banco — isolamento ficaria só na app. | **Alta** | Decisão arquitetural (ver §5). Recomendo **Supabase/Postgres** para o novo app, pois RLS por tenant é requisito duro (MÓD. 17). |
| R2 | **Gravação de vídeo cross-browser**: iOS Safari tem suporte parcial/instável a `MediaRecorder`; formatos (mp4 vs webm) e codecs variam. | **Alta** | Detecção de capacidade + fallback claro ("baixe pelo app da câmera"); manter vídeo **100% local** no MVP (spec exige). |
| R3 | **Isolamento multicliente**: vazamento entre tenants é o pior defeito possível. | **Alta** | RLS no Postgres + testes automatizados de isolamento (MÓD. 20) + `tenant_id` obrigatório em todas as tabelas. |
| R4 | **Segurança de webhooks Make**: replay, duplicidade, spoofing. | **Alta** | Assinatura HMAC, `idempotency_key` única, rate limit, logs de execução. |
| R5 | **Custo de IA sem controle**: geração de 5 formatos/dia por cliente escala custo. | Média | `cost_logs`, limites configuráveis, modelos menores p/ classificação e avançados só p/ geração final. |
| R6 | **Web Push no iOS**: só funciona em PWA instalada (iOS 16.4+), com restrições. | Média | Detecção de suporte, degradar para notificação in-app; arquitetura pronta p/ APNs/FCM/Expo. |
| R7 | **Protótipo em single-file** com estado ad-hoc: risco de "traduzir" bugs de estado. | Média | Reescrever como componentes tipados reutilizáveis; usar o protótipo só como referência visual/fluxo. |
| R8 | **Escopo muito grande p/ uma entrega**: 20 módulos. | Média | Execução estritamente por fases; app funcional ao fim de cada fase. |
| R9 | **Não expor tokens / não alterar credenciais** (regra explícita). | Alta | `.env.example` sem segredos; nada de credencial real em commits; segredos só em variáveis de ambiente. |
| R10 | **Coexistência no monorepo**: não quebrar os 3 apps existentes. | Baixa | App novo em pasta isolada `motor-autoridade/`, sem alterar os demais. |

---

## 5. Arquitetura sugerida

### 5.1 Decisão de stack de dados (ponto que requer sua confirmação)
A spec pede **Supabase**, mas o repositório já padronizou **libSQL/Turso + Drizzle + NextAuth**.
São caminhos incompatíveis para o requisito de **RLS por tenant**. Minha recomendação:

- **Recomendado — Supabase (Postgres) + Supabase Auth + RLS.**
  Motivos: RLS nativo no banco (isolamento multicliente é requisito duro), JSONB para
  `metadata`/`raw_response`/eventos, Storage opcional, Edge Functions, alinhamento total com a spec.
  Custo: introduz uma segunda stack de dados no monorepo (diferente do `ruah-crm`).

- **Alternativa — manter libSQL/Turso + Drizzle + NextAuth** (consistência com o repo).
  Custo: **sem RLS no banco** → isolamento apenas na aplicação, o que contraria MÓD. 17 e aumenta R3.

> **Recomendação:** seguir com **Supabase/Postgres** para o novo app. Reutilizamos os *padrões*
> do `ruah-crm` (estrutura de rotas, middleware, validação Zod, notificações, cron) e a *lógica*
> do `porta-voz` (IA/JSON/relatórios), mas com Postgres+RLS como base. **Confirme antes da Fase 2.**

### 5.2 Camadas
```
┌─────────────────────────────────────────────────────────────┐
│  PWA (Next.js App Router, mobile-first)                      │
│  Telas: Onboarding · Hoje · Formatos · Teleprompter ·        │
│         Biblioteca · Progresso · Relatório · Admin           │
│  Design tokens (Newsreader/Instrument Sans + paleta creme)   │
├─────────────────────────────────────────────────────────────┤
│  Camada de aplicação (Route Handlers / Server Actions)       │
│  Auth+papéis · Validação Zod · Rate limit · Auditoria        │
├───────────────┬───────────────┬─────────────────────────────┤
│ Camada de IA  │  Webhooks Make │  Notificações               │
│ provider abst.│  HMAC+idemp.   │  Web Push (+ futuro FCM/APNs)│
│ JSON+Zod+cost │  logs+dedup    │                             │
├───────────────┴───────────────┴─────────────────────────────┤
│  Supabase: Postgres + RLS + Auth (+ Storage quando preciso)  │
│  Edge Functions / cron (pauta diária, relatório semanal)     │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 Modelo multicliente
- Toda tabela de negócio carrega `tenant_id` (e `client_id` quando aplicável).
- Papéis: `super_admin`, `admin`, `client`, `collaborator`.
- RLS: cada linha só é visível ao seu tenant; admin/super_admin com políticas específicas.
- Onboarding obrigatório grava o `contexto_mestre` (JSONB) usado pela IA em toda geração.

### 5.4 Estrutura de pastas proposta (novo app, isolado)
```
motor-autoridade/
├─ public/            # manifest.json, ícones PWA, sw.js
├─ src/
│  ├─ app/            # App Router: (auth) (client) (admin) + api/
│  ├─ components/     # UI reutilizável (design system)
│  ├─ lib/
│  │  ├─ ai/          # provider abstrato + schemas Zod + cost/token
│  │  ├─ make/        # webhooks: assinatura, idempotência, logs
│  │  ├─ notifications/ # web push
│  │  ├─ events/      # registro de eventos comportamentais
│  │  └─ supabase/    # clients server/browser + RLS helpers
│  ├─ db/             # SQL/migrações, políticas RLS, seeds
│  └─ types/
├─ tests/
└─ docs/
```

---

## 6. Plano por fases

Cada fase termina com o app **funcional** e com relatório de arquivos criados/modificados,
comandos, configurações manuais e testes executados.

- **Fase 1 — Auditoria (este documento).** ✅ Diagnóstico, riscos, arquitetura, plano. *Aguarda aprovação.*
- **Fase 2 — Fundação.** Scaffold Next+PWA, design tokens, Supabase, schema+RLS+migrações,
  auth+papéis, onboarding→`contexto_mestre`, layout e navegação mobile-first.
- **Fase 3 — Conteúdo.** Tela Hoje, itens de conteúdo, 5 formatos, biblioteca, integração Make (endpoints).
- **Fase 4 — Teleprompter.** Câmera, rolagem, gravação local, salvamento no dispositivo, eventos, fallbacks.
- **Fase 5 — Comportamento.** Metas, progresso, motor de estímulos (sem culpa), Web Push, relatório semanal.
- **Fase 6 — Administração.** Dashboard admin, perfis de cliente, logs, custos, erros.
- **Fase 7 — Testes & entrega.** Testes automatizados + reais (iOS/Android/Safari/Chrome/desktop),
  documentação, plano de implantação, manual admin, backlog futuro.

---

## 7. Estimativa de complexidade por módulo

Escala: 🟢 baixa · 🟡 média · 🔴 alta. "Reúso" indica de onde herdamos.

| Módulo | Complexidade | Reúso | Observação |
|---|---|---|---|
| 1 · Autenticação + papéis | 🟡 | ruah-crm (padrão) | Supabase Auth muda a implementação; papéis + onboarding obrigatório |
| 2 · Onboarding editorial → contexto_mestre | 🟡 | protótipo | Muitos campos; gerar JSON mestre validado |
| 3 · Tela Hoje | 🟡 | protótipo | Depende de pauta do dia (Make/IA); estados vazio/erro |
| 4 · Formatos (5) | 🔴 | porta-voz (IA) + protótipo | 5 schemas de saída, geração e exibição adaptadas |
| 5 · Teleprompter + gravação local | 🔴 | protótipo | Cross-browser, `MediaRecorder`, fullscreen, fallback (R2) |
| 6 · Carrossel/Post por template | 🔴 | — | Render→imagem (canvas/DOM), download, templates editáveis |
| 7 · Eventos comportamentais | 🟢 | porta-voz (padrão) | Tabela + API de ingestão de eventos |
| 8 · Acompanhamento (estímulos) | 🟡 | protótipo (copy) | Regras por situação; copy sem culpa |
| 9 · Progresso | 🟡 | — | Agregações; métrica principal = publicado |
| 10 · Relatório semanal | 🟡 | porta-voz (Report) | Geração agendada (sexta/config), comparativos |
| 11 · Biblioteca | 🟢 | — | Busca + filtros |
| 12 · Notificações (Web Push) | 🔴 | ruah-crm (notif.) | Push + iOS PWA (R6) + preferências/limites/níveis |
| 13 · Dashboard administrativo | 🟡 | porta-voz (dashboard) | Muitos KPIs; leitura cross-tenant só p/ admin |
| 14 · Integração Make | 🔴 | ruah-crm (webhook) | HMAC, idempotência, dedup, logs (R4) |
| 15 · Banco de dados (~28 tabelas) | 🔴 | porta-voz (modelo) | SQL, índices, RLS, auditoria, funções |
| 16 · Conteúdo visual (templates) | 🟡 | — | Estrutura de templates; identidade por cliente (futuro) |
| 17 · Segurança | 🔴 | ambos | RLS, rate limit, validação, proteção de segredos (R3/R4/R9) |
| 18 · Custos de IA | 🟡 | porta-voz (duration_ms) | cost_logs, limites, seleção de modelo |
| 19 · PWA | 🟡 | — | Manifest, SW, cache, update, permissões |
| 20 · Testes | 🔴 | — | Cobertura ampla + testes de dispositivo reais |

**Módulos de maior risco/esforço:** 4, 5, 6, 12, 14, 15, 17, 20.

---

## 8. Próximo passo (aguardando decisão)

1. **Confirmar a stack de dados** (§5.1): recomendo **Supabase/Postgres + RLS**.
2. Confirmar que o novo app fica em **`motor-autoridade/`**, sem alterar os 3 projetos existentes.
3. Após o "ok", inicio a **Fase 2 — Fundação** (scaffold + design tokens + banco + RLS + auth + onboarding),
   entregando o app funcional e o relatório de arquivos/comandos/testes ao final.

*Nenhuma credencial foi lida/alterada; nenhum token exposto; nenhuma funcionalidade removida.
Este documento não faz mudanças estruturais — apenas registra o diagnóstico.*
