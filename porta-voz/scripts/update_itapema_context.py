"""
Atualiza os settings da org de Itapema com city_context dos gestores.
Uso: python3 scripts/update_itapema_context.py
"""
import urllib.request
import json
import sys

BASE = "http://localhost:8000/api/v1"


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


CITY_CONTEXT_ITAPEMA = {
    "city": "Itapema",
    "state": "SC",
    "prefeito": "Carlos Alexandre de Souza Ribeiro (Alexandre Xepa), mandato 2025",
    "vice_prefeito": "Eurico Osmari",
    "secretarios": "Caroline Poerner (Comunicação), Fabrício Lazzari/Fafá (Saúde), Jean Idimar da Silva (Obras), Íris Bispo da Silva (Assistência Social)",
    "camara": "13 vereadores, presidente Zulma Souza",
    "programas": "Avança Itapema (infraestrutura)",
    "bairros": "Meia Praia, Centro, Canto da Praia, Várzea, Morretes, Ilhota",
}

orgs = req("GET", "/organizations/")
if not orgs:
    print("Nenhuma organização encontrada.")
    sys.exit(1)

itapema = next((o for o in orgs if "itapema" in o["name"].lower()), None)
if not itapema:
    print("Org de Itapema não encontrada.")
    print("Orgs disponíveis:", [o["name"] for o in orgs])
    sys.exit(1)

org_id = itapema["id"]
print(f"Org encontrada: {itapema['name']} ({org_id[:8]}...)")

current_settings = itapema.get("settings") or {}
current_settings["city_context"] = CITY_CONTEXT_ITAPEMA

result = req("PATCH", f"/organizations/{org_id}", {"settings": current_settings})
if "id" in result:
    print("✓ Context atualizado com sucesso!")
else:
    print(f"✗ Erro: {result}")
