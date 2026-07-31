# RADAR PÚBLICO — Envio de alertas por WhatsApp (resumo para decisão)

> Documento focado **só na parte de envio de alertas**. Serve de base para um
> chat dedicado. Escrito a partir da leitura do código real (branch
> `claude/busy-mccarthy-qsdv6d`, que é a versão nova ainda **não implantada** no
> servidor).

---

## 1. Como o envio funciona hoje (arquitetura confirmada no código)

**Provedor atual:** Z-API (WhatsApp não-oficial). O `src/alerts/whatsapp.py`
manda texto e áudio via HTTP para a instância Z-API. Envia **1 mensagem privada
para cada número**, com retry por número. **Não** posta em grupo de WhatsApp.

**Vários números: suportado.** O sistema resolve os destinatários nesta ordem
(`monitor_job._get_recipients`):

1. `programs.alert_recipients` (lista JSON no programa) — se preenchida, **só ela
   vale** para aquele programa (ignora o resto). Pegadinha: verifique que está vazia.
2. **Tabela `alert_recipients`** por organização — **jeito recomendado.** Uma
   linha por número (`org_id`, `name`, `phone`, `is_active`, `urgency_filter`).
3. `.env → DEFAULT_ALERT_RECIPIENTS` — fallback global só se 1 e 2 vazios.

**Roteamento por cidade** (`analyzer/city_router.py`): um alerta só é enviado
quando o assunto é comprovadamente da **cidade contratada** (cidade principal ou
"afetada" + confiança mínima). Senão vai para revisão interna ou é bloqueado.
Isso evita "alerta de BC indo pra Itapema".

---

## 2. Ponto crítico: "cada cidade avisa só o responsável dela"

Cenário do cliente: **1 contrato, 5 cidades de SC, 2-3 responsáveis por cidade.**

A "cidade contratada" está amarrada à **organização**
(`contracted_city = city_filter da assinatura OU org.city`), e os destinatários
são buscados **só por `org_id`, sem filtro de cidade**. Consequências:

- ❌ **Uma org com as 5 cidades e todos os números juntos → todos recebem tudo.**
  O responsável por Itapema receberia alertas de Balneário Camboriú. Não fazer.
- ✅ **Modelar cada cidade como uma organização** (5 orgs, uma por cidade). Cada
  org com `city` própria e seus 2-3 números. O roteador entrega o alerta da
  cidade X só para a org X → só os responsáveis por X recebem. **Funciona no
  código atual, sem alteração.** Comercialmente ainda é "um contrato"; é só
  modelagem de dados. Custo já é medido por org (bônus: gasto por cidade).
- Alternativa (exige código): adicionar campo `city` em `alert_recipients` e
  filtrar destinatários pela cidade detectada. Mais flexível, mas é
  desenvolvimento — a modelagem "1 org por cidade" resolve sem tocar no código.

**Recomendação:** 1 organização por cidade.

---

## 3. Z-API vs. API Oficial da Meta (WhatsApp Cloud API)

### Z-API (atual)
- **Prós:** barato, rápido de configurar, envia texto e **áudio** livremente para
  qualquer número, sem template/aprovação prévia. Bom para **demos**.
- **Contras (sérios para cliente de credibilidade):** é **não-oficial** (viola os
  termos do WhatsApp). O número pode ser **banido sem aviso e sem recurso** → se
  cair no meio do contrato, os alertas param. **Sem SLA, sem garantia de
  entrega.** Risco reputacional direto com prefeitura.

### API Oficial da Meta — WhatsApp Cloud API (recomendada para produção)
- **Prós:** oficial, dentro dos termos, estável, com SLA, selo de negócio
  verificado possível. É o padrão para uso institucional/governo.
- **Requisitos:**
  1. **Número dedicado** exclusivo para a API — **não pode** ser um número já
     ativo num app normal de WhatsApp/WhatsApp Business. Precisa receber o código
     de verificação uma vez (SMS/ligação).
  2. Conta Meta Business + **verificação de negócio** (CNPJ).
  3. Mensagens iniciadas pela empresa (é o caso do alerta — você "empurra" sem o
     destinatário ter escrito antes) exigem **templates pré-aprovados** pela Meta,
     categoria **"utility"** (notificação de utilidade). Aprovação leva ~1-2 dias.
     Ex.: `🔴 Alerta {{cidade}}: {{tema}} — {{radio}}, {{hora}}`.
  4. Enviar o **áudio do trecho** fora da janela de 24h exige template com
     **header de mídia (áudio)**; dentro da janela de 24h dá para mandar mídia
     livre. Suportado, mas muda o fluxo de envio.
- **Custo:** a Meta cobra por mensagem/conversa (categoria "utility" no Brasil).
  Previsível, mas não é grátis. **Confirmar a tabela vigente para o Brasil** na
  hora da migração (as regras de cobrança da Meta mudam com frequência).
- **Como contratar:** direto pela Meta Cloud API (hospedagem gratuita da Meta,
  você só precisa do número + verificação) **ou** via um BSP (ex.: 360dialog,
  Twilio, Gupshup) que simplifica setup e templates.

### Recomendação honesta
- **Produção com esse cliente → Meta Cloud API.** A confiabilidade e a
  conformidade valem mais que a conveniência da Z-API. Basear a venda na
  estabilidade da Z-API é arriscado.
- **Demos podem rodar na Z-API** enquanto a conta oficial é aprovada, mas planeje
  a migração antes de assinar produção.

---

## 4. O que muda no código para migrar Z-API → Meta Cloud API

O ponto de envio é **isolado** em `src/alerts/whatsapp.py` (funções
`send_text`, `send_audio`, `send_to_recipients`). Migrar envolve:

1. Novas configs no `.env`: `WABA_ID`, `PHONE_NUMBER_ID`, token permanente da Meta.
2. Trocar o endpoint para `graph.facebook.com/v.../{PHONE_NUMBER_ID}/messages`.
3. Payload por **template** para mensagens iniciadas pela empresa (com variáveis:
   cidade, tema, rádio, hora).
4. Fluxo de mídia para o áudio: upload → `media_id` → envio (ou header de áudio
   no template).
5. Aprovar os templates na Meta (texto do alerta + variáveis) antes de produção.

Trabalho contido, mas real — dá para manter a Z-API como fallback de demo.

---

## 5. Perguntas em aberto para o chat dedicado

- Modelar as 5 cidades como 5 organizações (recomendado) ou pedir a alteração de
  código para filtrar destinatário por cidade dentro de uma org só?
- O cliente espera **mensagem privada por pessoa** (o que o sistema faz) ou um
  **grupo de WhatsApp** onde todos veem? (São coisas diferentes — alinhar antes.)
- Migrar para Meta Cloud API já na estreia, ou demos na Z-API + migração antes de
  produção?
- Quem provê o **número dedicado** e faz a verificação de negócio (CNPJ) na Meta?
- Formato dos templates de alerta (texto + variáveis) para submeter à aprovação.

---

### Regras que não podem falhar (checklist)
- Número no formato `55` + DDD + número, **sem `+`, espaço ou traço**
  (ex.: `5547999998888`). Formato errado = **falha silenciosa**.
- `urgency_filter = 'low'` ou `'high'` → recebe todos os alertas que o sistema
  dispara (só `high`/`critical` são enviados). `'critical'` recebe só os críticos.
- Testar com **um** disparo real e confirmar que **cada número** recebeu texto **e**
  áudio antes de confiar no cliente.
