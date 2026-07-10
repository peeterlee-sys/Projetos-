# Porta-Voz — Site (www.portavoz.ia.br)

Landing page estática (arquivo único `index.html`, autocontido) publicada na
**DigitalOcean App Platform** como *static site* — grátis, com HTTPS e CDN
automáticos.

A configuração de deploy está em [`../.do/app.yaml`](../.do/app.yaml).

---

## Passo a passo para colocar no ar

### 1. Criar o app na DigitalOcean (uma vez só)

1. Acesse <https://cloud.digitalocean.com/apps> e clique em **Create App**.
2. Escolha **GitHub** como fonte e autorize o repositório `peeterlee-sys/Projetos-`.
3. Selecione a branch `claude/portavoz-ia-digitalocean-yhcu17` e a pasta
   **`portavoz-site`** como *source directory*.
4. A DigitalOcean detecta que é um **Static Site**. No plano, escolha o
   **Starter (Static Site) — US$ 0/mês**.
5. Finalize com **Create Resources**. Em ~1 min o site fica no ar num endereço
   provisório tipo `https://portavoz-xxxx.ondigitalocean.app`.

> Alternativa mais rápida: no app, use **Settings → App Spec** e cole o conteúdo
> de `.do/app.yaml` (o arquivo já traz repo, branch, pasta e domínios prontos).

### 2. Apontar o domínio `portavoz.ia.br` (registro.br)

Você tem duas opções. A **A** é a mais simples e recomendada.

#### Opção A — Delegar o DNS para a DigitalOcean (recomendado)

Faz o apex (`portavoz.ia.br`) **e** o `www` funcionarem, com HTTPS automático,
gerenciando tudo num lugar só.

1. Na DigitalOcean: **App → Settings → Domains → Add Domain** e informe
   `www.portavoz.ia.br` (e `portavoz.ia.br` como *redirect/alias*). Escolha
   **"You manage your domain / DigitalOcean nameservers"**.
2. No **registro.br**: abra o domínio → **DNS** → em vez de "Configurar zona
   DNS", escolha **"Utilizar os servidores DNS de outro provedor"** e informe:
   ```
   ns1.digitalocean.com
   ns2.digitalocean.com
   ns3.digitalocean.com
   ```
3. Salve. A propagação leva de alguns minutos até 24–72h.

#### Opção B — Manter o DNS no registro.br (só o www)

Se preferir não mexer nos nameservers:

1. Na DigitalOcean: **App → Settings → Domains → Add Domain** →
   `www.portavoz.ia.br`. A DO mostra um **alias CNAME** terminando em
   `.ondigitalocean.app` — **copie**.
2. No **registro.br**: domínio → **DNS → Configurar zona DNS** e adicione:

   | Tipo  | Nome | Valor / Servidor                    |
   |-------|------|-------------------------------------|
   | CNAME | www  | `portavoz-xxxx.ondigitalocean.app.` |

   (cole exatamente o alias que a DO forneceu, com o ponto final).
3. Para o apex `portavoz.ia.br` (o CNAME não é permitido na raiz): use os
   **registros A** que a DigitalOcean informa na mesma tela de domínios, ou
   crie um redirecionamento `portavoz.ia.br → www.portavoz.ia.br`.

### 3. Conferir

Após a propagação do DNS, o certificado SSL é emitido automaticamente e o site
responde em **https://www.portavoz.ia.br**. Dá pra acompanhar o status na aba
**Domains** do app.

---

## Como atualizar o site depois

Como `deploy_on_push: true` está ativo, basta **substituir o
`portavoz-site/index.html`** e dar `git push` na branch configurada — a
DigitalOcean reconstrói e republica sozinha.
