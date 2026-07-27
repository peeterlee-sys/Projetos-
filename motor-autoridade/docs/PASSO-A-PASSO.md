# Assessor 24h — passo a passo para colocar no ar

Guia sequencial. Faça um passo por vez e confira o "✅ deu certo se" antes de
seguir. São 6 blocos; os três primeiros dão para fazer numa sentada.

O detalhe técnico de cada coisa está em `ASSESSOR-24H.md` — aqui é só o roteiro.

---

## Bloco A — Preparar a casa (~30 min)

### A1. Criar o banco

1. Entre em <https://supabase.com/dashboard> → **New project**.
2. Nome: `assessor24h`. Região: **South America (São Paulo)**.
3. Anote a senha do banco que ele pedir para criar (guarde no gerenciador de senhas).
4. Espere terminar de provisionar (~2 min).

✅ **deu certo se** o projeto aparece como *Active*.

### A2. Criar as tabelas

1. No projeto novo → menu lateral **SQL Editor** → **New query**.
2. Abra o arquivo `supabase/setup.sql` do repositório, copie **tudo** e cole lá.
3. Clique em **Run**.

✅ **deu certo se** aparecer *Success. No rows returned*. Confira em **Table
Editor**: devem existir `users`, `client_profiles`, `legacy_vereadores`,
`daily_opportunities`, entre outras.

### A3. Guardar as três chaves

Em **Project Settings → API**, copie e guarde:

- **Project URL** → vai virar `NEXT_PUBLIC_SUPABASE_URL`
- **anon public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role** → `SUPABASE_SERVICE_ROLE_KEY` (essa é secreta: nunca no navegador, nunca em print)

### A4. Publicar o site

1. <https://vercel.com/new> → importe o repositório **Projetos-**.
2. Em *Root Directory*, escolha **`motor-autoridade`**.
3. Antes de clicar em Deploy, abra **Environment Variables** e cole:

   ```
   NEXT_PUBLIC_BRAND=assessor24h
   NEXT_PUBLIC_SUPABASE_URL=<Project URL do A3>
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon do A3>
   SUPABASE_SERVICE_ROLE_KEY=<service_role do A3>
   MAKE_WEBHOOK_SECRET=<invente uma senha longa, ex.: 32 caracteres>
   ANTHROPIC_API_KEY=<sua chave da Anthropic>
   ```

   Guarde o `MAKE_WEBHOOK_SECRET` — ele volta no Bloco D.
4. **Deploy**.

✅ **deu certo se** abrir a URL `.vercel.app` e aparecer a página do Assessor 24h
(não a do Take). Se aparecer "Take", falta o `NEXT_PUBLIC_BRAND`.

> ⚠️ **Não toque no projeto do Take na Vercel.** Este é um projeto novo, separado.

### A5. Ligar o domínio

1. Vercel → projeto novo → **Settings → Domains** → adicione `assessor24h.ia.br`.
2. Ele mostra os registros de DNS. No **registro.br**, cadastre o que ele pedir
   (normalmente `A` do domínio para `76.76.21.21`).
3. Espere propagar (de 10 min a algumas horas). O cadeado (HTTPS) a Vercel emite sozinha.
4. **Não esqueça:** Supabase → **Authentication → URL Configuration**:
   - *Site URL*: `https://assessor24h.ia.br`
   - *Redirect URLs*: `https://assessor24h.ia.br/auth/callback`

✅ **deu certo se** `https://assessor24h.ia.br` abre a página com cadeado.

---

## Bloco B — Seu acesso de admin (~5 min)

### B1. Criar sua conta

Acesse `https://assessor24h.ia.br/signup` e cadastre-se com seu e-mail.
Vai aparecer "Cadastro em análise" — é o esperado.

### B2. Virar administrador

Supabase → **SQL Editor** → nova query:

```sql
update public.users
   set role = 'super_admin', is_active = true
 where email = 'peeterlee@gmail.com';
```

Clique em **Run**. Depois, no site, saia e entre de novo.

✅ **deu certo se** `https://assessor24h.ia.br/painel` abrir o dashboard.

---

## Bloco C — Trazer os vereadores das planilhas (~20 min)

### C1. Exportar as planilhas

No Google Sheets, em cada uma: **Arquivo → Fazer download → CSV**.
Salve como `nomes.csv` e `respostas.csv`.
(Guarde os arquivos: são o seu backup.)

### C2. Conferir antes de gravar

No computador, dentro da pasta `motor-autoridade`:

```bash
node scripts/import-planilhas.mjs --nomes nomes.csv --respostas respostas.csv --dry-run
```

Ele mostra quantos vereadores encontrou e uma amostra. **Nada foi gravado ainda.**

✅ **deu certo se** o total bate com o número de vereadores que você tem.

### C3. Gravar

```bash
export NEXT_PUBLIC_SUPABASE_URL="<Project URL>"
export SUPABASE_SERVICE_ROLE_KEY="<service_role>"
node scripts/import-planilhas.mjs --nomes nomes.csv --respostas respostas.csv
```

✅ **deu certo se** eles aparecem em `assessor24h.ia.br/painel` → aba
**Vereadores**, marcados como *Aguardando anamnese*.

---

## Bloco D — Ligar o WhatsApp no banco (~30 min)

Aqui o assistente para de ler planilha e passa a ler o banco.

### D1. Abrir o cenário

Make → cenário **"MEU ASSESSOR - IA"** → antes de mexer, **⋯ → Export Blueprint**
e salve o arquivo. É o seu "desfazer".

### D2. Trocar o módulo da planilha

Delete o módulo **Google Sheets → Search Rows** e ponha no lugar
**HTTP → Make a request**:

| Campo | Valor |
| --- | --- |
| URL | `https://assessor24h.ia.br/api/make` |
| Method | `POST` |
| Headers | nome `x-motor-secret`, valor: o `MAKE_WEBHOOK_SECRET` do A4 |
| Body type | Raw · JSON (application/json) |
| Parse response | **Yes** |

Corpo da requisição:

```json
{
  "action": "get_vereador",
  "idempotency_key": "{{1.messageId}}",
  "payload": { "phone": "{{1.phone}}" }
}
```

> `{{1.messageId}}` e `{{1.phone}}` vêm do módulo do webhook do WhatsApp —
> ajuste o número do módulo se no seu cenário for outro.

### D3. Apontar o Claude para o DNA

No módulo do Claude, onde antes entrava a coluna "Perfil" da planilha, coloque
`{{2.vereador.editorial_dna}}` (o número do módulo HTTP). Acrescente ao prompt:

> Nunca cite: `{{2.vereador.adversaries}}`.
> Nunca fale sobre: `{{2.vereador.forbidden_themes}}`.

### D4. Rodar uma vez

Clique em **Run once** e mande uma mensagem de um número que está na planilha.

✅ **deu certo se** o módulo HTTP responder `"found": true`.

| Resposta | O que fazer |
| --- | --- |
| `401 assinatura inválida` | o `x-motor-secret` está diferente do `MAKE_WEBHOOK_SECRET` |
| `"found": false, "reason": "nao_cadastrado"` | o telefone não está no banco — confira o Bloco C |
| `"status": "duplicate"` | o `idempotency_key` repetiu; use o id da mensagem |

---

## Bloco E — Testar com um vereador de verdade (1 dia)

1. Escolha **um** vereador de confiança.
2. Mande o link: `https://assessor24h.ia.br/anamnese`
3. Ele preenche as 8 etapas (uns 10 minutos).
4. Você aprova em `assessor24h.ia.br/painel` → **Cadastros pendentes**.
5. Ele manda uma mensagem no WhatsApp.

✅ **deu certo se** a resposta sair com o jeito de falar dele — bandeiras,
expressões, bordão — e no painel o DNA dele aparecer preenchido.

Se o DNA estiver vazio: painel → *Falhas de IA*. Ele pode refazer em
`https://assessor24h.ia.br/anamnese?refazer=1`.

---

## Bloco F — Virar a chave (quando o Bloco E estiver redondo)

1. Mande o link para todos os vereadores:

   > Vereador, agora a anamnese do Assessor 24h é por aqui:
   > https://assessor24h.ia.br/anamnese
   > São 8 etapas rápidas (uns 10 minutos). Ao terminar, a IA monta o DNA do seu
   > mandato — é o que faz o assistente responder com a sua voz, suas bandeiras
   > e seus limites. O formulário antigo do Google sai do ar.

2. Desative o Google Form (Respostas → *Aceitando respostas* desligado).
3. **Deixe as planilhas de pé por uns dias.** Elas não atrapalham nada.
4. Quando todos tiverem respondido e o assistente estiver rodando liso:
   delete o cenário "Anamnese → Planilha de Nomes" e arquive as planilhas.

---

## Se algo der errado

| Sintoma | Causa provável |
| --- | --- |
| Site mostra "Take" | falta `NEXT_PUBLIC_BRAND=assessor24h` na Vercel |
| E-mail de confirmação leva para o domínio errado | falta ajustar *Site URL* no Supabase (A5) |
| `/painel` redireciona para `/hoje` | sua conta não é `super_admin` (B2) |
| Vereador trava no "Cadastro em análise" | falta você aprovar no painel |
| "Este WhatsApp já está cadastrado em outro mandato" | o número já está em outro perfil; confira no painel |
| Make responde 401 | segredo diferente entre Vercel e Make |

Na dúvida, o painel é o termômetro: `assessor24h.ia.br/painel` mostra falhas de
IA, falhas do Make e a última execução do cenário.

---

## Depois do go-live (decidido, ainda não feito)

Nesta ordem, quando os blocos A–F estiverem redondos:

1. **Dashboard do vereador** — o app já tem a área do cliente (Hoje, Biblioteca,
   tela de conteúdo com roteiro e legenda). Falta o cenário do Make devolver o
   que gerou no WhatsApp para o banco (ação `save_content` na `/api/make`), para
   que apareça na Biblioteca e a assessoria copie de um computador.
   **Acesso: a assessoria usa o mesmo login e senha do vereador** — sem conta
   separada, sem gestão de permissão.
   *Estimativa: meio dia.*

2. **Métricas de atendimento no WhatsApp** — ação `log_interaction` para o
   painel mostrar última interação, atendimentos na semana e assuntos mais
   pedidos. Hoje essas colunas ficam vazias porque o vereador só usa WhatsApp.
   *Estimativa: ~2 horas.*
