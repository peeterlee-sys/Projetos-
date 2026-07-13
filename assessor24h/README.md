# Assessor 24h — Landing Page

Landing page de divulgação do **Assessor 24h** — plataforma de comunicação e
inteligência legislativa para vereadores, operada pelo WhatsApp.

A página é um único arquivo `index.html` autossuficiente (aplicação React
empacotada — todo o CSS, JS e imagens estão embutidos). Não há build: é só
servir o arquivo estático.

```
assessor24h/
├── index.html        # a landing page completa (abra no navegador para ver)
├── favicon.ico       # ícone da aba
├── .do/app.yaml      # spec de deploy do DigitalOcean App Platform
└── README.md
```

## Testar localmente

```bash
cd assessor24h
python3 -m http.server 8099
# abra http://localhost:8099
```

## Publicar no DigitalOcean App Platform

A hospedagem é o **App Platform** (site estático), com deploy automático a cada
push no GitHub. O domínio final é **https://assessor24h.ia.br**.

### Opção A — Painel web (mais simples)

1. Acesse https://cloud.digitalocean.com/apps e clique em **Create App**.
2. Em **Service Provider**, escolha **GitHub** e autorize o repositório
   `peeterlee-sys/Projetos-`.
3. Selecione a branch `claude/assessor-24h-landing-deploy-013r2v` (ou a branch
   para onde você mesclar depois, ex. `main`).
4. Em **Source Directory**, informe `/assessor24h`.
5. O App Platform detecta que é um **Static Site** sem build. Se pedir:
   - **Build Command**: deixe **vazio**.
   - **Output Directory**: deixe **vazio** (serve o próprio `source_dir`).
6. Avance, escolha o plano **Starter (Static Site — grátis)** e crie o app.
7. Aguarde o primeiro deploy (~1–2 min). Você recebe uma URL provisória
   `*.ondigitalocean.app` para conferir.

### Opção B — Linha de comando (`doctl`)

Requer o [`doctl`](https://docs.digitalocean.com/reference/doctl/how-to/install/)
autenticado (`doctl auth init`):

```bash
doctl apps create --spec assessor24h/.do/app.yaml
```

O arquivo `.do/app.yaml` já traz a configuração pronta (repo, branch,
`source_dir`, deploy automático no push e o domínio).

## Domínio: assessor24h.ia.br

Depois do app criado, aponte o domínio (feito no **registro.br**, onde a zona
`.ia.br` é gerenciada):

1. No app, vá em **Settings → Domains → Add Domain** e informe
   `assessor24h.ia.br`.
2. Escolha **You manage your domain** (você gerencia o DNS no registro.br).
3. O DigitalOcean mostra os registros a criar. Como `assessor24h.ia.br` é um
   domínio de topo (apex), no painel do **registro.br** crie:
   - Um registro **ALIAS/ANAME** (o registro.br chama de "apontamento") do apex
     para o alvo `*.ondigitalocean.app` que o DO indicar; **ou**
   - Delegue o DNS para os nameservers da DigitalOcean
     (`ns1/ns2/ns3.digitalocean.com`) e gerencie a zona lá — nesse caso o DO
     cria o ALIAS e o certificado SSL sozinho.
4. Aguarde a propagação do DNS (minutos a algumas horas). O App Platform emite
   o certificado **HTTPS (Let's Encrypt) automaticamente**.

Pronto: `https://assessor24h.ia.br` no ar, com deploy automático a cada push.
