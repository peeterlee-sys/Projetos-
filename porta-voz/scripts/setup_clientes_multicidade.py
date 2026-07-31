"""
Setup multi-cidade — cria UMA organização por cidade e cadastra os
destinatários de alerta de cada uma.

POR QUE UMA ORG POR CIDADE?
    No RADAR PÚBLICO a "cidade contratada" e os destinatários ficam amarrados
    à ORGANIZAÇÃO. Se você colocar várias cidades numa org só, TODOS os números
    recebem os alertas de TODAS as cidades. Modelando 1 org por cidade, o
    roteador entrega o alerta da cidade X só para os responsáveis da cidade X.
    (Comercialmente continua sendo um contrato só — é só a modelagem interna.)

COMO USAR:
    1. Preencha os telefones em CIDADES abaixo (formato 5547999998888:
       55 + DDD + número, SEM +, espaço ou traço). Deixe "" nos que ainda
       não tiver — o script pula os vazios e você roda de novo depois.
    2. No droplet, com o serviço no ar:
         cd /root/projetos-/porta-voz
         python3 scripts/setup_clientes_multicidade.py
    3. É seguro rodar várias vezes: orgs já existentes (mesmo nome) são
       reaproveitadas e destinatários repetidos (mesmo telefone) não são
       duplicados.

Rádios/programas NÃO são criados aqui (dependem das URLs de stream reais e de
quais rádios cobrem cada cidade). Use scripts/setup_balneario_camboriu.py como
modelo para cada rádio; se várias cidades compartilham a mesma rádio, crie uma
StationSubscription com city_filter = a cidade, para o roteamento funcionar.
"""
import json
import re
import sys
import urllib.error
import urllib.request

BASE = "http://localhost:8000/api/v1"

# ─── CONFIG: uma entrada por cidade — PREENCHA OS TELEFONES ────────────────────
# phone: "5547999998888" (55 + DDD + número). Deixe "" para preencher depois.
# urgency_filter: "low" (recebe todos os alertas enviados) ou "critical"
#                 (só os mais graves). Padrão recomendado: "low".

CLIENTE = "Consórcio Multi-Cidades SC"  # rótulo só para os prints (informativo)

CIDADES = [
    {
        "org_name": "RADAR PÚBLICO — Itapema",
        "city": "Itapema",
        "state": "SC",
        "recipients": [
            {"name": "Responsável Itapema 1", "phone": "", "urgency_filter": "low"},
            {"name": "Responsável Itapema 2", "phone": "", "urgency_filter": "low"},
            {"name": "Responsável Itapema 3", "phone": "", "urgency_filter": "low"},
        ],
    },
    {
        "org_name": "RADAR PÚBLICO — Balneário Camboriú",
        "city": "Balneário Camboriú",
        "state": "SC",
        "recipients": [
            {"name": "Responsável BC 1", "phone": "", "urgency_filter": "low"},
            {"name": "Responsável BC 2", "phone": "", "urgency_filter": "low"},
            {"name": "Responsável BC 3", "phone": "", "urgency_filter": "low"},
        ],
    },
    {
        "org_name": "RADAR PÚBLICO — Camboriú",
        "city": "Camboriú",
        "state": "SC",
        "recipients": [
            {"name": "Responsável Camboriú 1", "phone": "", "urgency_filter": "low"},
            {"name": "Responsável Camboriú 2", "phone": "", "urgency_filter": "low"},
            {"name": "Responsável Camboriú 3", "phone": "", "urgency_filter": "low"},
        ],
    },
    {
        "org_name": "RADAR PÚBLICO — Porto Belo",
        "city": "Porto Belo",
        "state": "SC",
        "recipients": [
            {"name": "Responsável Porto Belo 1", "phone": "", "urgency_filter": "low"},
            {"name": "Responsável Porto Belo 2", "phone": "", "urgency_filter": "low"},
            {"name": "Responsável Porto Belo 3", "phone": "", "urgency_filter": "low"},
        ],
    },
    {
        "org_name": "RADAR PÚBLICO — Itajaí",
        "city": "Itajaí",
        "state": "SC",
        "recipients": [
            {"name": "Responsável Itajaí 1", "phone": "", "urgency_filter": "low"},
            {"name": "Responsável Itajaí 2", "phone": "", "urgency_filter": "low"},
            {"name": "Responsável Itajaí 3", "phone": "", "urgency_filter": "low"},
        ],
    },
]

# ─── Infra ────────────────────────────────────────────────────────────────────

PHONE_RE = re.compile(r"^55\d{10,11}$")  # 55 + DDD(2) + número(8 ou 9 dígitos)


def valid_phone(phone: str) -> bool:
    return bool(PHONE_RE.match(phone or ""))


def req(method, path, data=None):
    url = BASE + path
    body = json.dumps(data).encode() if data is not None else None
    headers = {"Content-Type": "application/json"} if body else {}
    r = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            print(
                "\n  ✗ A API respondeu "
                f"{e.code} (exige autenticação).\n"
                "    O código do servidor divergiu do repositório. Opções:\n"
                "      a) descubra o header/token de auth do servidor e ajuste req();\n"
                "      b) cadastre direto no banco por SQL (ver docs/ENVIO-ALERTAS-WHATSAPP.md).\n"
            )
            sys.exit(2)
        try:
            return json.loads(e.read())
        except Exception:
            return {"detail": f"HTTP {e.code}"}
    except urllib.error.URLError as e:
        print(f"\n  ✗ Não consegui falar com {BASE} ({e}).")
        print("    O serviço está no ar? systemctl status porta-voz.service")
        sys.exit(2)


def find_org_by_name(name):
    """Reaproveita org existente com o mesmo nome (torna o script idempotente)."""
    orgs = req("GET", "/organizations/")
    if isinstance(orgs, list):
        for o in orgs:
            if o.get("name") == name:
                return o
    return None


def existing_phones(org_id):
    recs = req("GET", f"/organizations/{org_id}/recipients")
    if isinstance(recs, list):
        return {r.get("phone") for r in recs}
    return set()


# ─── Execução ─────────────────────────────────────────────────────────────────

print("=" * 60)
print(f"  RADAR PÚBLICO — Setup multi-cidade ({CLIENTE})")
print("=" * 60)

total_orgs = total_recip = total_skipped = 0

for entry in CIDADES:
    name = entry["org_name"]
    print(f"\n▸ {entry['city']} / {entry['state']}")

    # 1. Organização (reaproveita se já existir)
    org = find_org_by_name(name)
    if org and "id" in org:
        org_id = org["id"]
        print(f"  • org já existe ({org_id[:8]}…) — reaproveitando")
    else:
        org = req("POST", "/organizations/", {
            "name": name,
            "city": entry["city"],   # vira a cidade contratada (contracted_city)
            "state": entry["state"],
            "plan": "mvp",
            "settings": {"city_context": {"city": entry["city"], "state": entry["state"]}},
        })
        if "id" not in org:
            print(f"  ✗ erro ao criar org: {org}")
            continue
        org_id = org["id"]
        total_orgs += 1
        print(f"  ✓ org criada ({org_id[:8]}…)")

    # 2. Destinatários (valida formato, pula vazios e duplicados)
    ja_cadastrados = existing_phones(org_id)
    for rcp in entry["recipients"]:
        phone = (rcp.get("phone") or "").strip()
        if not phone:
            total_skipped += 1
            print(f"    – {rcp['name']}: VAZIO (preencher depois)")
            continue
        if not valid_phone(phone):
            total_skipped += 1
            print(f"    ✗ {rcp['name']}: formato inválido '{phone}' "
                  "(use 55+DDD+número, ex.: 5547999998888)")
            continue
        if phone in ja_cadastrados:
            print(f"    • {rcp['name']} ({phone}) já cadastrado — ok")
            continue
        result = req("POST", f"/organizations/{org_id}/recipients", {
            "name": rcp["name"],
            "phone": phone,
            "urgency_filter": rcp.get("urgency_filter", "low"),
        })
        if "id" in result:
            total_recip += 1
            print(f"    ✓ {rcp['name']} ({phone})")
        else:
            print(f"    ✗ {rcp['name']} ({phone}) — {result}")

# ─── Resumo ───────────────────────────────────────────────────────────────────

print("\n" + "=" * 60)
print(f"  Orgs criadas nesta execução:        {total_orgs}")
print(f"  Destinatários adicionados:          {total_recip}")
print(f"  Números pendentes/pulados:          {total_skipped}")
print("=" * 60)
if total_skipped:
    print("  ⚠️  Ainda há números em branco/inválidos. Preencha em CIDADES")
    print("      e rode de novo — o script não duplica o que já existe.")
print("  Próximo passo: cadastrar as rádios/programas de cada cidade")
print("  (modelo em scripts/setup_balneario_camboriu.py) e testar 1 disparo.")
