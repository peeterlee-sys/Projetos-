"""
Substitui as keywords do sistema por uma lista mais cirúrgica.
Uso: python3 scripts/update_keywords.py
"""
import urllib.request
import urllib.parse
import json
import sys

BASE = "http://localhost:8000/api/v1"

NOVAS_KEYWORDS = [
    # Mandatários e instituições
    "prefeitura",
    "prefeito",
    "vice-prefeito",
    "secretaria",
    "secretário",
    "câmara municipal",
    "vereador",
    # Nomes dos gestores
    "alexandre xepa",
    "eurico osmari",
    "caroline poerner",
    "fabrício lazzari",
    "fafá",
    "jean idimar",
    "íris bispo",
    "zulma souza",
    "avança itapema",
    # Serviços públicos que geram reclamações
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
    # Bairros (Claude filtra se é relevante ou não)
    "meia praia",
    "canto da praia",
    "várzea",
    "morretes",
    "ilhota",
]


def req(method, path, data=None):
    url = BASE + path
    body = json.dumps(data).encode() if data else None
    headers = {"Content-Type": "application/json"} if body else {}
    r = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return json.loads(e.read())


# 1. Busca a org
orgs = req("GET", "/organizations/")
if not orgs:
    print("Nenhuma organização encontrada.")
    sys.exit(1)

org = orgs[0]
org_id = org["id"]
print(f"Org: {org['name']} ({org_id})")

# 2. Lista keywords existentes e desativa todas
existing = req("GET", f"/keywords/?org_id={org_id}")
print(f"\nKeywords existentes: {len(existing)}")
for kw in existing:
    print(f"  - {kw['term']} (id: {kw['id'][:8]}...)")

# 3. Desativa todas as keywords antigas
print(f"\nDesativando keywords antigas...")
for kw in existing:
    req("DELETE", f"/keywords/{kw['id']}")
    print(f"  ✗ removida: {kw['term']}")

# 4. Adiciona as novas keywords
print(f"\nAdicionando {len(NOVAS_KEYWORDS)} keywords novas...")
ok = 0
fail = 0
for term in NOVAS_KEYWORDS:
    result = req("POST", "/keywords/", {
        "org_id": org_id,
        "term": term,
        "weight": 1,
    })
    if "id" in result:
        print(f"  ✓ {term}")
        ok += 1
    elif "detail" in result and "already exists" in str(result.get("detail", "")):
        print(f"  = {term} (já existe)")
        ok += 1
    else:
        print(f"  ✗ {term} — {result}")
        fail += 1

print(f"\nConcluído: {ok} adicionadas, {fail} falhas")
