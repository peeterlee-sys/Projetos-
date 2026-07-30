# RADAR PÚBLICO — Deploy seguro da versão nova (item 8 do manual)

> **Objetivo:** levar as correções (roteamento por cidade, áudio completo, dedup,
> custos e saúde das rádios) para o droplet **sem perder o `.env`, o banco, nem
> eventuais edições locais que só existem no servidor** — e sem `git pull` cego.
>
> Rode tudo **conectado por SSH no droplet** (`ssh root@147.182.211.211`).
> Este runbook foi escrito depois de conferir o repositório; os pontos de atenção
> abaixo são reais, não teóricos.

---

## 0. Fatos confirmados no Git (leia antes de tocar no servidor)

1. **As correções do `porta-voz` vivem SÓ na branch `claude/busy-mccarthy-qsdv6d`.**
   Não estão na `main`. Arquivos-chave que existem só nela:
   `src/analyzer/city_router.py`, `src/capture/clip_builder.py`,
   `src/api/routes/health.py`, `src/core/costs.py`,
   `migrations/versions/0004_city_routing_audio_health.py`.

2. **`main` e `claude/busy-mccarthy-qsdv6d` NÃO têm ancestral comum** (históricos
   independentes). Portanto **`git pull` / `git merge` entre elas é proibido** —
   geraria conflito artificial em tudo. O deploy correto **substitui** o conteúdo
   do `porta-voz` pela versão da branch, não faz merge.

3. **A migração `0004` é aditiva e reversível.** Ela só faz `add_column` em
   `analyses` e `alerts` e cria a tabela `capture_events` (+1 índice). Cadeia:
   `0001 → 0002 → 0003 → 0004`. Tem `downgrade()` completo. `alembic upgrade head`
   **não apaga dados**.

4. **Sinal de divergência no servidor:** a API respondeu `401` (exige auth) mas o
   código no GitHub **não tem auth**. Isso indica edições feitas direto no droplet
   que não estão em nenhuma branch. **Por isso: backup + diff ANTES de sobrescrever.**

---

## 1. Backup (obrigatório — não pule)

```bash
cd /root/projetos-/porta-voz
ts=$(date +%Y%m%d-%H%M%S)
mkdir -p /root/backups
# banco (cópia consistente do SQLite)
sqlite3 porta_voz.db ".backup '/root/backups/porta_voz-$ts.db'"
# .env
cp .env /root/backups/env-$ts.bak
# snapshot do código atual do servidor (para diff e rollback)
tar czf /root/backups/portavoz-code-$ts.tgz --exclude='venv' --exclude='*.db' .
ls -lh /root/backups/ | tail -5
```

Guarde o nome `$ts` — é o seu ponto de restauração.

---

## 2. Capturar o estado real do servidor num Git local (para diff honesto)

O objetivo é comparar **byte a byte** o que está rodando vs. a branch, para
descobrir o que foi editado direto no servidor (ex.: a auth do 401).

```bash
cd /root/projetos-/porta-voz
git status            # é um repo git? qual branch/commit?
git rev-parse HEAD 2>/dev/null || echo "NAO é repo git"
git remote -v 2>/dev/null
```

### Caso A — a pasta JÁ é um repositório git
```bash
git stash list                       # tem algo guardado?
git fetch origin claude/busy-mccarthy-qsdv6d
# DIFF do que o servidor tem hoje vs. a versão nova (NÃO altera nada ainda):
git diff --stat HEAD origin/claude/busy-mccarthy-qsdv6d -- src/ migrations/
# olhe com atenção arquivos de API/auth:
git diff HEAD origin/claude/busy-mccarthy-qsdv6d -- src/api/ | less
```

### Caso B — a pasta NÃO é repositório git (provável, dado o 401 sem histórico)
```bash
cd /root
git clone --branch claude/busy-mccarthy-qsdv6d --single-branch \
  https://github.com/peeterlee-sys/Projetos-.git /root/radar-novo
# compara a versão nova com o que está rodando:
diff -ru /root/projetos-/porta-voz/src /root/radar-novo/porta-voz/src | less
```

**Regra:** qualquer diferença em arquivos de **API/auth** (ex.: `src/api/`) é
provavelmente a edição local que causa o 401. Anote cada uma. Ela precisa ser
**reaplicada por cima** da versão nova, ou você reabre o buraco de segurança / ou
quebra o WhatsApp/painel. Não descarte silenciosamente.

---

## 3. Aplicar o código novo (substituição, não merge)

> Faça com o serviço **parado** para não pegar arquivos pela metade.

```bash
systemctl stop porta-voz.service
```

### Se Caso A (repo git na pasta)
```bash
cd /root/projetos-/porta-voz
# preserva alterações locais não commitadas, se houver:
git stash push -u -m "estado-servidor-$ts" || true
git checkout claude/busy-mccarthy-qsdv6d
git reset --hard origin/claude/busy-mccarthy-qsdv6d
# reaplique manualmente as edições locais necessárias (ex.: auth da API) que você
# identificou no passo 2, e confira que o .env NÃO foi tocado:
git status
```

### Se Caso B (pasta sem git)
```bash
# copie só o código, preservando .env e o banco (que NÃO estão no repo):
rsync -a --delete \
  --exclude '.env' --exclude 'porta_voz.db' --exclude 'venv/' \
  /root/radar-novo/porta-voz/ /root/projetos-/porta-voz/
```

Confirme que `.env` e `porta_voz.db` continuam intactos:
```bash
cd /root/projetos-/porta-voz
ls -l .env porta_voz.db
diff <(sort /root/backups/env-$ts.bak) <(sort .env) && echo ".env intacto"
```

---

## 4. Dependências + migração do banco

```bash
cd /root/projetos-/porta-voz
source venv/bin/activate
pip install -r requirements.txt          # a versão nova pode ter libs novas
alembic current                          # deve mostrar 0003 (ou anterior)
alembic upgrade head                      # aplica a 0004 (aditiva, sem perda)
alembic current                          # deve mostrar 0004 agora
```

Se `alembic current` mostrar algo inesperado (ex.: já em 0004, ou vazio),
**pare** e investigue antes de seguir — não force.

---

## 5. Subir, mas AINDA sem gastar (0 programas ativos)

```bash
# garanta que tudo está desativado (repouso), pra validar sem custo:
python3 -c "import sqlite3;d=sqlite3.connect('porta_voz.db');print(d.execute('UPDATE programs SET is_active=0').rowcount);d.commit()"
systemctl start porta-voz.service
sleep 8
curl -s http://localhost:8000/health                       # active_monitoring_jobs deve ser 0
curl -s http://localhost:8000/api/v1/health/stations       # rota NOVA — se responder, o código novo está no ar
journalctl -u porta-voz.service -n 40 --no-pager           # sem tracebacks?
```

Se `/api/v1/health/stations` responder (em vez de 404), **a versão nova está
rodando**. Se der 404, o serviço ainda está no código antigo — volte ao passo 3.

---

## 6. Teste real com UMA rádio (validar cidade certa + áudio completo)

```bash
cd /root/projetos-/porta-voz
# ver programas:
python3 - <<'EOF'
import sqlite3
db=sqlite3.connect('porta_voz.db')
for r in db.execute("SELECT id,name,is_active FROM programs ORDER BY name"):
    print(r[2], r[0], r[1])
EOF
# reativar UM (troque o nome):
python3 - <<'EOF'
import sqlite3
db=sqlite3.connect('porta_voz.db')
n=db.execute("UPDATE programs SET is_active=1 WHERE name=?", ("Bote a Boca no Trombone",)).rowcount
db.commit(); print(f"{n} reativado(s)")
EOF
systemctl restart porta-voz.service
sleep 8 && curl -s http://localhost:8000/health
# disparar na hora (pegue o PROGRAM_ID do passo acima):
curl -s -X POST http://localhost:8000/api/v1/programs/<PROGRAM_ID>/monitor/start
journalctl -u porta-voz.service -f     # acompanhe: transcrição, cidade detectada, alerta
```

**Critérios de aceite da demo:**
- alerta sai para a **cidade certa** (não manda coisa de Balneário Camboriú para Itapema);
- o **áudio do clipe é completo** (não corta em ~30 s);
- `curl -s http://localhost:8000/api/v1/health/costs` mostra custo estimado.

Pré-requisitos de custo antes de ligar de verdade: **crédito na Anthropic**
(senão transcreve e não gera alerta, gastando Whisper à toa), OpenAI (Whisper,
US$ 0,006/min) e Z-API conectada.

---

## 7. Rollback (se qualquer passo der errado)

```bash
systemctl stop porta-voz.service
# restaura código
tar xzf /root/backups/portavoz-code-$ts.tgz -C /root/projetos-/porta-voz
# restaura banco
cp /root/backups/porta_voz-$ts.db /root/projetos-/porta-voz/porta_voz.db
# restaura .env
cp /root/backups/env-$ts.bak /root/projetos-/porta-voz/.env
systemctl start porta-voz.service
sleep 8 && curl -s http://localhost:8000/health
```

Como a migração 0004 tem `downgrade()`, se você aplicou a migração mas quer
reverter só o schema (mantendo o resto): `alembic downgrade 0003`.

---

## 8. Depois de validar

- Ligue **backup semanal** do droplet no painel DigitalOcean (~US$ 1,20/mês).
- Só passe para **produção (todas as rádios)** depois que a demo de 1 rádio
  passar nos 3 critérios de aceite acima.
- Deixe os programas **desativados** entre demos para não gastar
  (`UPDATE programs SET is_active=0` + `systemctl restart`).

---

### Resumo de 1 linha
Backup → diff servidor×branch (achar a edição do 401) → **substituir** o código
(não merge) preservando `.env`/db → `alembic upgrade head` → subir com 0 ativos →
testar 1 rádio → só então produção.
