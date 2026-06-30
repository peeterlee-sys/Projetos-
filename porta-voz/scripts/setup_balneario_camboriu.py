"""
Setup completo para Balneário Camboriú — Menina FM.
Cria: organização, rádio, programa, keywords e destinatários de alerta.

Uso: python3 scripts/setup_balneario_camboriu.py
"""
import urllib.request
import json
import sys

BASE = "http://localhost:8000/api/v1"

# ─── Dados de Balneário Camboriú ─────────────────────────────────────────────

# ATENÇÃO: esta URL pode ser a página do player, não o stream direto.
# Se der erro de captura, abra https://portalmenina.com.br/streaming/ no Chrome,
# pressione F12 → Network → filtre por "audio" ou ".mp3" ou ".aac" para achar o stream real.
STREAM_URL = "https://portalmenina.com.br/streaming/"

YOUTUBE_URL = ""

RADIO_NAME = "Menina FM"

PROGRAM_NAME = "Bote a Boca no Trombone"

PROGRAM_START = "06:00"
PROGRAM_END   = "08:25"

PROGRAM_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"]

ALERT_RECIPIENTS = [
    {"name": "Alerta BC", "phone": "5547999459031"},
]

# TODO: preencha com os nomes reais dos gestores de BC antes de rodar
CITY_CONTEXT = {
    "city": "Balneário Camboriú",
    "state": "SC",
    "prefeito": "TODO_NOME_PREFEITO_BC",
    "vice_prefeito": "TODO_NOME_VICE_BC",
    "secretarios": "TODO_SECRETÁRIOS_BC",
    "camara": "Câmara Municipal de Balneário Camboriú",
    "programas": "TODO_PROGRAMAS_DA_GESTÃO_BC",
    "bairros": "Centro, Barra Sul, Nações, Pioneiros, Tabuleiro, Agronomica, Municípios",
}

# ─── Keywords específicas de BC ───────────────────────────────────────────────

KEYWORDS_BC = [
    # Instituições
    "prefeitura",
    "prefeito",
    "vice-prefeito",
    "secretaria",
    "secretário",
    "câmara municipal",
    "vereador",
    # Serviços públicos
    "hospital",
    "upa",
    "posto de saúde",
    "unidade de saúde",
    "saneamento",
    "esgoto",
    "buraco",
    "pavimentação",
    "obra pública",
    "coleta de lixo",
    "ônibus",
    "transporte público",
    "iluminação pública",
    # Específicos BC
    "balneário camboriú",
    "balneário",
    "barra sul",
    "nações",
    "pioneiros",
    "tabuleiro",
    # Adicione os nomes dos gestores de BC aqui:
    # "nome do prefeito",
    # "nome do secretário",
]

# ─────────────────────────────────────────────────────────────────────────────


def req(method, path, data=None):
    url = BASE + path
    body = json.dumps(data).encode() if data is not None else None
    headers = {"Content-Type": "application/json"} if body else {}
    r = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return json.loads(e.read())


ctx_todos = [k for k, v in CITY_CONTEXT.items() if "TODO" in str(v)]
if ctx_todos:
    print("⚠️  Atenção: gestores de BC não preenchidos em CITY_CONTEXT.")
    print(f"   Campos pendentes: {', '.join(ctx_todos)}")
    print("   O sistema funcionará, mas o Claude terá menos contexto sobre quem é quem.")
    print()

print("=" * 55)
print("  PORTA VOZ — Setup Balneário Camboriú")
print("=" * 55)

# 1. Cria a organização
print("\n[1/5] Criando organização...")
org = req("POST", "/organizations/", {
    "name": "Prefeitura de Balneário Camboriú",
    "city": "Balneário Camboriú",
    "state": "SC",
    "plan": "mvp",
    "settings": {"city_context": CITY_CONTEXT},
})
if "id" not in org:
    print(f"  ✗ Erro ao criar org: {org}")
    sys.exit(1)
org_id = org["id"]
print(f"  ✓ Org criada: {org['name']} ({org_id[:8]}...)")

# 2. Cria a rádio
print("\n[2/5] Cadastrando rádio...")
stream_type = "youtube" if YOUTUBE_URL and not STREAM_URL.startswith("TODO") else "stream"
station = req("POST", "/stations/", {
    "org_id": org_id,
    "name": RADIO_NAME,
    "city": "Balneário Camboriú",
    "state": "SC",
    "stream_url": STREAM_URL if not STREAM_URL.startswith("TODO") else None,
    "youtube_url": YOUTUBE_URL or None,
    "stream_type": stream_type,
    "is_active": True,
})
if "id" not in station:
    print(f"  ✗ Erro ao criar rádio: {station}")
    sys.exit(1)
station_id = station["id"]
print(f"  ✓ Rádio criada: {station['name']} ({station_id[:8]}...)")

# 3. Cria o programa
print("\n[3/5] Cadastrando programa...")
program = req("POST", "/programs/", {
    "station_id": station_id,
    "name": PROGRAM_NAME,
    "days_of_week": PROGRAM_DAYS,
    "start_time": PROGRAM_START,
    "end_time": PROGRAM_END,
    "timezone": "America/Sao_Paulo",
    "is_active": True,
    "alert_recipients": [],
})
if "id" not in program:
    print(f"  ✗ Erro ao criar programa: {program}")
    sys.exit(1)
program_id = program["id"]
print(f"  ✓ Programa criado: {program['name']} ({PROGRAM_START}–{PROGRAM_END})")

# 4. Adiciona keywords
print(f"\n[4/5] Adicionando {len(KEYWORDS_BC)} keywords...")
ok = fail = 0
for term in KEYWORDS_BC:
    result = req("POST", "/keywords/", {
        "org_id": org_id,
        "term": term,
        "weight": 1,
    })
    if "id" in result:
        ok += 1
    elif "already exists" in str(result.get("detail", "")):
        ok += 1
    else:
        print(f"  ✗ {term} — {result}")
        fail += 1
print(f"  ✓ {ok} keywords adicionadas, {fail} falhas")

# 5. Adiciona destinatários de alertas
print(f"\n[5/5] Cadastrando {len(ALERT_RECIPIENTS)} destinatário(s)...")
for recipient in ALERT_RECIPIENTS:
    result = req("POST", f"/organizations/{org_id}/recipients", {
        "name": recipient["name"],
        "phone": recipient["phone"],
        "urgency_filter": "low",
    })
    if "id" in result:
        print(f"  ✓ {recipient['name']} ({recipient['phone']})")
    else:
        print(f"  ✗ {recipient['name']} — {result}")

# Resumo
print("\n" + "=" * 55)
print("  ✅ Setup concluído!")
print(f"  Org ID:      {org_id}")
print(f"  Station ID:  {station_id}")
print(f"  Program ID:  {program_id}")
print(f"\n  O programa será monitorado automaticamente em:")
print(f"  {', '.join(PROGRAM_DAYS)} das {PROGRAM_START} às {PROGRAM_END}")
print("=" * 55)
