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

STREAM_URL = "https://painel.sintonizar.tv.br/stream/meninacam"

YOUTUBE_URL = ""

RADIO_NAME = "Menina FM"

PROGRAM_NAME = "Bote a Boca no Trombone"

PROGRAM_START = "06:00"
PROGRAM_END   = "08:25"

PROGRAM_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"]

ALERT_RECIPIENTS = [
    {"name": "Alerta BC", "phone": "5547999459031"},
]

CITY_CONTEXT = {
    "city": "Balneário Camboriú",
    "state": "SC",
    "prefeito": "Juliana Pavan Von Borstel (prefeita), mandato 2025-2028",
    "vice_prefeito": "Nilson Probst",
    "secretarios": (
        "Casa Civil: Leandro Índio (Leandro Arthur Rodrigues da Silva); "
        "Comunicação: Dagmara Spautz; "
        "Saúde: Aline Leal; "
        "Educação: Zélia Zanella; "
        "Obras: Aldemar Bola Pereira; "
        "Fazenda: Magda Bez; "
        "Planejamento Urbano: Carlos Humberto Silva; "
        "Segurança e Ordem Pública: Carlos Alberto Araújo Gomes; "
        "Turismo: Evandro Neiva Oliveira; "
        "Assistência Social, Mulher e Família: Dão Koeddermann; "
        "Pessoa Idosa: Claudir Maciel; "
        "Meio Ambiente: Nelson Oliveira; "
        "Governo e Inovação: Gilson Bordin; "
        "Gestão de Pessoas: Ary Souza; "
        "Compras e Convênios: José Neto; "
        "Articulação Política: Omar Tomalih; "
        "Procuradoria: Diego Montibeler; "
        "Controladoria: Angelita Koslowski"
    ),
    "camara": "Câmara Municipal de Balneário Camboriú",
    "bairros": "Centro, Barra Sul, Nações, Pioneiros, Tabuleiro, Agronomica, Municípios",
}

# ─── Keywords específicas de BC ───────────────────────────────────────────────

KEYWORDS_BC = [
    # Instituições
    "prefeitura",
    "prefeita",
    "vice-prefeito",
    "secretaria",
    "secretário",
    "câmara municipal",
    "vereador",
    # Gestores pelo nome
    "juliana pavan",
    "nilson probst",
    "leandro índio",
    "dagmara spautz",
    "aline leal",
    "zélia zanella",
    "aldemar pereira",
    "aldemar bola",
    "magda bez",
    "carlos humberto",
    "evandro neiva",
    "dão koeddermann",
    "claudir maciel",
    "nelson oliveira",
    "gilson bordin",
    "ary souza",
    "omar tomalih",
    "diego montibeler",
    "angelita koslowski",
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
