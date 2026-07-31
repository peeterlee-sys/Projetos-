# RADAR PÚBLICO — Ligar o sistema e cadastrar emissoras (handoff)

> Tudo sobre **como abrir/ligar o sistema** e **adicionar novas emissoras**.
> Feito para um chat dedicado só a operar (ligar/desligar/cadastrar rádio).
> Baseado no manual do cliente + leitura do código real.
>
> ⚠️ **Antes de produção de verdade**, a versão nova (branch
> `claude/busy-mccarthy-qsdv6d`) precisa ser implantada — o servidor roda código
> antigo. Ver `docs/DEPLOY-SEGURO-RADAR-PUBLICO.md`. Para **demos** pontuais, o
> código atual já liga.

---

## 1. Infra (onde tudo está)

| Item | Valor |
|---|---|
| Servidor | DigitalOcean `147.182.211.211` (`curl -s ifconfig.me` confirma) |
| Pasta | `/root/projetos-/porta-voz` |
| Serviço | systemd `porta-voz.service` → `venv/bin/python run.py`, `localhost:8000` |
| Banco | SQLite `porta_voz.db` · Config `.env` · Domínio `radarpublico.ia.br` |

Estado de repouso atual: **programas desativados** (`is_active=0`),
`active_monitoring_jobs: 0`, `CLAUDE_MODEL=claude-haiku-4-5`. ⚠️ Sem crédito na
Anthropic no momento — sem crédito, transcreve mas não gera alerta (gasta Whisper à toa).

---

## 2. Como a ativação funciona (o mecanismo real)

Confirmado em `src/scheduler/job_manager.py`:
- No **start do serviço**, `load_programs()` carrega **todos os programas com
  `is_active = True`** e agenda cada um via APScheduler (CronTrigger) pelos
  `days_of_week` + `start_time`/`end_time` + timezone.
- **Portanto: ligar = marcar `is_active=1` nos programas + reiniciar o serviço.**
  O sistema começa a monitorar sozinho **no horário** de cada programa.
- Para **disparar na hora** (sem esperar o horário): rota
  `POST /api/v1/programs/{program_id}/monitor/start` (e `/stop` para parar).
- Só é agendado o que tiver `days_of_week`, `start_time` e `end_time` preenchidos
  (programas incompletos são pulados com log `skip_incomplete`).

---

## 3. Pré-checagem antes de ligar

```bash
cd /root/projetos-/porta-voz
grep -E 'OPENAI_API_KEY|ANTHROPIC_API_KEY|ZAPI_|CLAUDE_MODEL' .env   # chaves preenchidas?
ffmpeg -version | head -1        # OBRIGATÓRIO (captura de áudio). Falta? apt install ffmpeg
yt-dlp --version                 # só se houver rádio via YouTube
df -h /                          # espaço em disco (áudios acumulam)
systemctl status porta-voz.service --no-pager | head -5
```

Créditos que precisam estar ativos:
- **Anthropic** (análise) — https://console.anthropic.com
- **OpenAI/Whisper** (transcrição) — US$ 0,006/min de áudio
- **Z-API** (WhatsApp) — instância conectada/paga

---

## 4. Ligar — modo DEMO (uma rádio só, recomendado)

```bash
cd /root/projetos-/porta-voz
# ver programas e IDs:
python3 - <<'EOF'
import sqlite3
db=sqlite3.connect('porta_voz.db')
for r in db.execute("SELECT is_active,id,name FROM programs ORDER BY name"):
    print(r[0], r[1], r[2])
EOF
# reativar UM programa por nome:
python3 - <<'EOF'
import sqlite3
db=sqlite3.connect('porta_voz.db')
n=db.execute("UPDATE programs SET is_active=1 WHERE name=?", ("Bote a Boca no Trombone",)).rowcount
db.commit(); print(f"{n} reativado(s)")
EOF
systemctl restart porta-voz.service
sleep 8 && curl -s http://localhost:8000/health          # active_monitoring_jobs deve refletir
```

Disparar na hora (pegue o PROGRAM_ID do passo acima):
```bash
curl -s -X POST http://localhost:8000/api/v1/programs/<PROGRAM_ID>/monitor/start
# parar:
curl -s -X POST http://localhost:8000/api/v1/programs/<PROGRAM_ID>/monitor/stop
```

---

## 5. Ligar — modo PRODUÇÃO (todas as rádios)

```bash
cd /root/projetos-/porta-voz
python3 -c "import sqlite3;d=sqlite3.connect('porta_voz.db');print(d.execute('UPDATE programs SET is_active=1').rowcount,'ativados');d.commit()"
systemctl restart porta-voz.service
sleep 8 && curl -s http://localhost:8000/health          # jobs > 0
```

---

## 6. Adicionar NOVA EMISSORA (rádio) + programa

Uma rádio só é monitorada se tiver **pelo menos um programa** com horário. Passos:
**org → rádio → programa → keywords** (e, se a rádio é compartilhada por várias
cidades, **subscription** com `city_filter`).

### 6.1. Campos (confirmados nos schemas)

**Rádio** (`POST /api/v1/stations/`):
```json
{
  "org_id": "ID_DA_ORG",
  "name": "Menina FM",
  "city": "Balneário Camboriú",
  "state": "SC",
  "stream_url": "https://.../stream.mp3",   // stream direto (MP3/HLS)
  "youtube_url": "",                          // se for rádio via YouTube
  "stream_type": "stream",                   // "stream" (padrão) ou "youtube"
  "is_active": true
}
```
- `stream_type="stream"` → captura direto do `stream_url` com **ffmpeg**.
- `stream_type="youtube"` → usa `youtube_url` (resolve via `src/capture/youtube.py`; exige **yt-dlp** instalado).

**Programa** (`POST /api/v1/programs/`) — é o que faz a rádio ser monitorada:
```json
{
  "station_id": "ID_DA_RADIO",
  "name": "Nome do Programa",
  "days_of_week": ["monday","tuesday","wednesday","thursday","friday"],
  "start_time": "06:00",
  "end_time": "08:25",
  "timezone": "America/Sao_Paulo",
  "alert_recipients": []      // vazio = usa os destinatários da org (recomendado)
}
```
Dias válidos: `monday..sunday`. `alert_recipients` só se quiser sobrescrever os
destinatários **daquele** programa (senão deixe `[]`).

**Keywords** (`POST /api/v1/keywords/`): `{ "org_id": "...", "term": "hospital", "weight": 1 }`
— sem keyword que dê match, o alerta nem é analisado.

**Assinatura** (só se várias cidades usam a mesma rádio) `POST /api/v1/subscriptions/`:
```json
{ "station_id": "ID_DA_RADIO", "org_id": "ID_DA_ORG_DA_CIDADE", "city_filter": "Itapema" }
```
`city_filter` define a cidade contratada daquela org na rádio compartilhada.

### 6.2. Modelo pronto
`scripts/setup_balneario_camboriu.py` cria org+rádio+programa+keywords+destinatário
de ponta a ponta — **copie e adapte** para cada nova emissora.

### 6.3. ⚠️ A API do servidor responde 401
No servidor atual a API exige auth que o código do repositório não tem. Enquanto
não for resolvido, cadastre **por SQL**. Ex.: nova rádio + programa:
```bash
cd /root/projetos-/porta-voz
python3 - <<'EOF'
import sqlite3, uuid
from datetime import datetime
db=sqlite3.connect('porta_voz.db')
ORG_ID="COLE_O_ORG_ID"
sid=uuid.uuid4().hex; pid=uuid.uuid4().hex; now=datetime.utcnow().isoformat()
db.execute("INSERT INTO radio_stations (id,org_id,name,city,state,stream_url,stream_type,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,?,?)",
           (sid,ORG_ID,"Nome FM","Cidade","SC","https://STREAM_URL","stream",now,now))
import json
db.execute("INSERT INTO programs (id,station_id,name,days_of_week,start_time,end_time,timezone,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,?,?)",
           (pid,sid,"Nome do Programa",json.dumps(["monday","tuesday","wednesday","thursday","friday"]),"06:00","08:25","America/Sao_Paulo",now,now))
db.commit(); print("station:",sid,"program:",pid)
EOF
systemctl restart porta-voz.service     # recarrega o agendamento
```

Depois de cadastrar, **reinicie o serviço** para o job_manager reagendar.

---

## 7. Monitorar custo e saúde depois de ligar

```bash
journalctl -u porta-voz.service -f                       # logs ao vivo (Ctrl+C sai)
curl -s http://localhost:8000/api/v1/health/stations     # status das rádios (versão nova)
curl -s http://localhost:8000/api/v1/health/costs        # custo estimado por org (versão nova)
curl -s http://localhost:8000/api/v1/alerts/             # alertas enviados
```

---

## 8. Desligar (voltar ao repouso — gasto zero)

```bash
cd /root/projetos-/porta-voz
python3 -c "import sqlite3;d=sqlite3.connect('porta_voz.db');print(d.execute('UPDATE programs SET is_active=0').rowcount);d.commit()"
systemctl restart porta-voz.service
sleep 8 && curl -s http://localhost:8000/health          # active_monitoring_jobs:0
```

---

## 9. Gotchas (o que não pode falhar)

- **ffmpeg é obrigatório** para capturar áudio; **yt-dlp** só para rádios via YouTube.
- Rádio **sem programa com horário** não é monitorada (o agendador pula incompletos).
- Depois de mexer em `is_active`/programas/rádios, **reinicie o serviço** para reagendar.
- Sem **crédito na Anthropic**, o sistema transcreve mas não gera alerta → gasta
  Whisper à toa. Coloque crédito ou mantenha desligado.
- **Espaço em disco:** áudios acumulam — acompanhe `df -h /`.
- API com **401** no servidor → use SQL até resolver a divergência/deploy.
- Confirme que é a mesma máquina: `curl -s ifconfig.me` → `147.182.211.211`.

---

### Ordem recomendada (consultor)
1. Não ligue produção ainda; ligue **1 rádio em modo demo** quando tiver reunião.
2. Coloque ~US$ 25 na Anthropic para as demos.
3. Antes de operação real: **deploy seguro da versão nova** (cidade certa + áudio completo).
4. Ligue **backup semanal** do droplet no painel DigitalOcean (~US$ 1,20/mês).
