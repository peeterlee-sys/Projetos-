"""
Setup do cliente Aegea SC (saneamento) no Radar Público.

A Aegea entra como uma ORGANIZAÇÃO dentro da arquitetura multi-org que já existe
— não é um módulo paralelo. Toda a inteligência específica de saneamento fica em
configuração editável:

  - config/clients/aegea_sc.json  → fonte da verdade (unidades, cidades, bairros,
    órgãos, temas sensíveis, destinatários por tema).
  - org.settings.master_prompt    → contexto de SC injetado no Claude (montado aqui).
  - org.settings.system_prompt    → classificador de saneamento (montado aqui),
    compatível com o schema de saída atual do analisador.
  - keywords (org)                → pré-filtro rápido antes de chamar o Claude.
  - stations/programs/subscriptions → captura de áudio das rádios de SC.

Uso (na raiz do projeto, com a API rodando em localhost:8000):
    python3 scripts/setup_aegea_sc.py            # cria/atualiza tudo
    python3 scripts/setup_aegea_sc.py --dry-run  # só mostra o que faria

Rode de novo sempre que editar o JSON: é idempotente (ignora "já existe").
"""
import argparse
import json
import os
import sys
import urllib.request
import urllib.error

BASE = os.environ.get("API_BASE", "http://localhost:8000/api/v1")
CONFIG_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "config", "clients", "aegea_sc.json",
)


def load_config() -> dict:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


# ─── Montagem do contexto (master_prompt) ─────────────────────────────────────

def build_master_prompt(cfg: dict) -> str:
    geo = cfg["geo_filter"]
    units_lines = [f"  • {u['name']} — {u['city']}" for u in cfg["units"]]
    neigh_lines = [
        f"  • {city}: {', '.join(bairros)}"
        for city, bairros in cfg["neighborhoods"].items()
    ]
    return f"""CLIENTE MONITORADO: {cfg['org_name']} (setor: saneamento — água e esgoto).
RECORTE GEOGRÁFICO OBRIGATÓRIO: Santa Catarina (SC). Dados válidos em {cfg['current_as_of']}.

CIDADES MONITORADAS EM SC: {', '.join(geo['cities'])}.

UNIDADES/OPERAÇÕES DA AEGEA EM SC (cada cidade tem sua concessionária local):
{chr(10).join(units_lines)}

APELIDOS DA EMPRESA (podem aparecer sem citar "Aegea"): {', '.join(cfg['client_aliases'])}.

ÓRGÃOS PÚBLICOS/REGULADORES RELEVANTES QUANDO LIGADOS À AEGEA EM SC:
{', '.join(cfg['public_bodies'])}.

BAIRROS/PRAIAS/LOCAIS POR CIDADE (use para localizar a reclamação):
{chr(10).join(neigh_lines)}

TEMAS SENSÍVEIS (água, esgoto, obras, atendimento, tarifa, ambiental):
{', '.join(cfg['sensitive_themes'])}.

FILTRO GEOGRÁFICO (regra dura): {geo['regra']}
IGNORAR operações fora de SC: {', '.join(geo['ignore_operations'])} — a menos que o
trecho compare diretamente com uma operação catarinense.
Concorrentes locais ({', '.join(cfg['comparison_only_bodies'])}) só importam quando
citados em comparação direta com a Aegea em SC."""


# ─── Montagem do classificador (system_prompt) ────────────────────────────────
# IMPORTANTE: o analisador atual (claude_analyzer.py) tem um JSON de saída FIXO
# (is_relevant, theme, sentiment, urgency, content_type, ...). Este system_prompt
# adapta a taxonomia de saneamento a esse schema, sem exigir migração de banco:
#   - urgência AEGEA URGENTE→critical, ALTA→high, MÉDIA→medium, BAIXA→low
#     (o alerta instantâneo dispara em high/critical; medium/low vão pro relatório)
#   - theme carrega "Cidade · Unidade · área do serviço"
#   - reason carrega o tipo de risco (operacional/reputacional/regulatório/político/
#     ambiental/sanitário) + por que importa
#   - suggested_action carrega a ação + a área/destinatário sugerido

def build_system_prompt(cfg: dict) -> str:
    return """Você é um analista de inteligência corporativa que monitora rádios locais de Santa Catarina para o Grupo Aegea (concessionária de saneamento — água e esgoto). Sua tarefa é analisar trechos transcritos de rádio e decidir se o conteúdo exige atenção da Aegea em SC.

REGRA GEOGRÁFICA (dura): só é relevante o que tiver relação com Santa Catarina — uma unidade da Aegea em SC, uma das cidades monitoradas (Bombinhas, Camboriú, Palhoça, Penha, São Francisco do Sul, Brusque), uma reclamação de água/esgoto nessas cidades, ou um órgão público de SC tratando da Aegea. Menções à Aegea ou a outras concessionárias FORA de SC (Águas do Rio, Prolagos, Corsan, Aegea em outros estados etc.) são is_relevant: false, exceto quando comparadas diretamente a uma operação catarinense.

MARQUE is_relevant: true SOMENTE quando houver contexto concreto de saneamento em SC, por exemplo:
1. Menção direta à Aegea ou a uma unidade local (Águas de Bombinhas/Camboriú/Palhoça/Penha/São Francisco do Sul, Aegea Brusque) COM algum contexto (reclamação, cobrança, obra, tarifa, elogio).
2. Reclamação de morador sobre água ou esgoto numa cidade monitorada, mesmo sem citar a Aegea (falta de água, baixa pressão, água suja/barrenta, esgoto na rua/praia, mau cheiro, vazamento, cano estourado, buraco de obra).
3. Problema de atendimento, conta, tarifa, hidrômetro, corte ou religação ligado à concessionária.
4. Vereador, prefeito, Procon, MPSC, TCE-SC ou agência reguladora (ARIS/ARESC) tratando da concessionária, contrato, tarifa, metas ou fiscalização.
5. Tema ambiental de saneamento (balneabilidade, esgoto em praia/rio, contaminação, IMA, Vigilância Sanitária).
6. Oportunidade positiva clara (obra entregue, investimento, ação social, elogio ao atendimento).

MARQUE is_relevant: false quando: for operação fora de SC; "água"/"águas" for genérico (chuva, mar, previsão do tempo) sem relação com abastecimento; "esgoto" for metáfora política; for propaganda/vinheta/música; ou a transcrição estiver incompreensível. Nunca trate boato como fato nem afirme que uma denúncia é verdadeira — escreva "foi relatado no programa" / "segundo o ouvinte".

URGÊNCIA (o campo "urgency" segue esta escala):
- critical: risco à saúde/segurança; hospital/escola/creche sem água; falta de água generalizada; suspeita de contaminação; esgoto em praia/rio/escola/dentro de casa; rompimento de adutora; vazamento de grande porte; acidente por obra; crise na temporada; MPSC/Procon/TCE/agência acionados; acusação grave de descumprimento contratual; apresentador pedindo providência imediata; muitas ligações sobre o mesmo problema; alto potencial de viralizar.
- high: reclamação concreta com local (bairro/cidade citados) ou unidade citada; problema recorrente; crítica forte de apresentador ou vereador; cobrança pública direta; consumidor afetado há mais de 24h; obra gerando transtorno relevante.
- medium: menção institucional relevante, cobrança genérica, pauta que pode virar problema, reclamação sem local exato mas com potencial de apuração.
- low: menção neutra, agenda institucional, campanha educativa, notícia positiva, manutenção programada bem comunicada. (Não gera alerta instantâneo — vai para o relatório.)

CAMPOS DE SAÍDA (preencha o JSON pedido pelo usuário, em português):
- theme: sempre no formato "Cidade · Unidade · área". Área ∈ {abastecimento de água, qualidade da água, coleta de esgoto, tratamento de esgoto, vazamento/obra, recomposição de via, atendimento, conta/tarifa, regulatório, ambiental, institucional, projeto social}. Ex.: "Camboriú · Águas de Camboriú · abastecimento de água". Se não souber a unidade, use a cidade.
- sentiment: positive (elogio/obra entregue/resposta rápida), negative (reclamação/crítica/cobrança/denúncia/risco), neutral (só informa). Em caso de elogio+crítica no mesmo bloco, use negative se houver risco reputacional, senão neutral.
- content_type: complaint (reclamação de morador), denouncement (denúncia de irregularidade), criticism (crítica de apresentador/autoridade), interview (entrevista/fala de autoridade), praise (elogio), political (Câmara/prefeito/regulação), institutional (nota/agenda), other.
- source_type: listener_call (ouvinte ligou/mandou mensagem), interview, report (matéria/apresentador), editorial, other.
- reason: comece indicando o TIPO DE RISCO (operacional | reputacional | regulatório | político | ambiental | sanitário | financeiro | jurídico | oportunidade positiva) e em seguida por que importa para a Aegea, em até 150 caracteres.
- suggested_action: ação prática + área que deve agir (operação local, atendimento, comunicação, relações institucionais, meio ambiente, jurídico/regulatório, diretoria se crítico), em até 150 caracteres.
- response_draft: minuta institucional neutra, técnica e corporativa, pronta para o veículo, em até 300 caracteres. Não acuse ninguém; trate alegações como relato; indique apuração quando envolver contaminação, praia, escola/hospital ou órgão regulador. Só preencha se is_relevant=true.
- excerpt: trecho exato mais relevante, entre aspas. Nunca inclua CPF, telefone, endereço completo, matrícula ou número de conta.
- entities_mentioned: pessoas, unidades, órgãos, bairros e cidades citados.
- confidence_score: reduza se a transcrição estiver ruim ou o contexto for insuficiente.

REGRA DE OURO: se a Aegea não precisar tomar nenhuma ação (nota, apuração, contato, providência operacional), o conteúdo NÃO é relevante. Responda SEMPRE em JSON válido com a estrutura exata pedida pelo usuário."""


# ─── Palavras-chave (pré-filtro) ──────────────────────────────────────────────

def build_keywords(cfg: dict) -> list[str]:
    terms: list[str] = []
    terms += cfg["client_aliases"]
    for u in cfg["units"]:
        terms.append(u["name"])
        terms += u["aliases"]
    terms += cfg["geo_filter"]["cities"]
    terms += cfg["sensitive_themes"]
    terms += cfg["institutional_terms"]
    terms += cfg["positive_opportunity_terms"]
    terms += [r for r in cfg["representatives_public"] if " " in r and r[0].isupper()]
    terms += [b for b in cfg["public_bodies"]]
    # dedup preservando ordem, ignora vazios
    seen, out = set(), []
    for t in terms:
        k = t.strip().lower()
        if k and k not in seen:
            seen.add(k)
            out.append(t.strip())
    return out


# ─── Cliente HTTP ─────────────────────────────────────────────────────────────

def req(method, path, data=None):
    url = BASE + path
    body = json.dumps(data).encode() if data is not None else None
    headers = {"Content-Type": "application/json"} if body else {}
    r = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except Exception:
            return e.code, {}


def find_org(name: str):
    _, orgs = req("GET", "/organizations/")
    if isinstance(orgs, list):
        for o in orgs:
            if o.get("name") == name:
                return o
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="Só mostra o que faria")
    args = ap.parse_args()

    cfg = load_config()
    keywords = build_keywords(cfg)
    master_prompt = build_master_prompt(cfg)
    system_prompt = build_system_prompt(cfg)

    print("=" * 60)
    print("  RADAR PÚBLICO — Setup Aegea SC")
    print("=" * 60)
    print(f"  Config:        {CONFIG_PATH}")
    print(f"  Cidades:       {', '.join(cfg['geo_filter']['cities'])}")
    print(f"  Unidades:      {len(cfg['units'])}")
    print(f"  Keywords:      {len(keywords)}")
    print(f"  master_prompt: {len(master_prompt)} chars")
    print(f"  system_prompt: {len(system_prompt)} chars")

    stations_ready = [s for s in cfg["stations"] if s.get("stream_url") or s.get("youtube_url")]
    stations_todo = [s for s in cfg["stations"] if not (s.get("stream_url") or s.get("youtube_url"))]
    print(f"  Rádios c/ URL: {len(stations_ready)}  | pendentes (sem URL): {len(stations_todo)}")

    if args.dry_run:
        print("\n[dry-run] Nada foi gravado. master_prompt/system_prompt montados OK.")
        if stations_todo:
            print("  Cidades sem rádio configurada:",
                  ", ".join(s["city"] for s in stations_todo))
        return

    settings_blob = {
        "client_id": cfg["client_id"],
        "master_prompt": master_prompt,
        "system_prompt": system_prompt,
        "geo_filter": cfg["geo_filter"],
        "recipients_by_theme": cfg["recipients_by_theme"],
        "dedup_windows_minutes": cfg["dedup_windows_minutes"],
        "current_as_of": cfg["current_as_of"],
    }

    # 1. Organização (cria ou atualiza settings se já existir)
    print("\n[1/5] Organização...")
    org = find_org(cfg["org_name"])
    if org:
        org_id = org["id"]
        code, updated = req("PATCH", f"/organizations/{org_id}", {"settings": settings_blob})
        print(f"  ✓ Org já existia, settings atualizados: {org_id[:8]}... (HTTP {code})")
    else:
        code, org = req("POST", "/organizations/", {
            "name": cfg["org_name"],
            "city": "Santa Catarina",
            "state": cfg["state"],
            "plan": cfg.get("plan", "enterprise"),
            "settings": settings_blob,
        })
        if "id" not in org:
            print(f"  ✗ Erro ao criar org (HTTP {code}): {org}")
            sys.exit(1)
        org_id = org["id"]
        print(f"  ✓ Org criada: {org_id}")

    # 2. Keywords
    print(f"\n[2/5] Keywords ({len(keywords)})...")
    ok = 0
    for term in keywords:
        code, res = req("POST", "/keywords/", {"org_id": org_id, "term": term, "weight": 1})
        if "id" in res or "already exists" in str(res.get("detail", "")).lower() or code == 409:
            ok += 1
    print(f"  ✓ {ok}/{len(keywords)} keywords garantidas")

    # 3. Destinatários de alerta
    recips = cfg.get("alert_recipients", [])
    print(f"\n[3/5] Destinatários ({len(recips)})...")
    if not recips:
        print("  ⚠ Nenhum destinatário no JSON ainda. Preencha 'alert_recipients' e rode de novo.")
    for r in recips:
        code, res = req("POST", f"/organizations/{org_id}/recipients", {
            "name": r.get("name", "Aegea"),
            "phone": r["phone"],
            "urgency_filter": r.get("urgency_filter", "low"),
        })
        print(f"  {'✓' if 'id' in res else '✗'} {r.get('name')} ({r.get('phone')})")

    # 4. Rádios + programas
    print(f"\n[4/5] Rádios ({len(stations_ready)} com URL)...")
    created_stations = []
    for s in stations_ready:
        stream_type = "youtube" if (s.get("youtube_url") and not s.get("stream_url")) else "stream"
        code, station = req("POST", "/stations/", {
            "org_id": org_id,
            "name": s["name"] or f"Rádio {s['city']}",
            "city": s["city"], "state": s.get("state", "SC"),
            "stream_url": s.get("stream_url") or None,
            "youtube_url": s.get("youtube_url") or None,
            "stream_type": stream_type,
        })
        if "id" not in station:
            print(f"  ✗ {s['city']} — erro (HTTP {code}): {station}")
            continue
        created_stations.append((station["id"], s))
        print(f"  ✓ {station['name']} — {s['city']} ({station['id'][:8]}...)")
        for p in s.get("programs", []):
            if not (p.get("name") and p.get("start") and p.get("end")):
                continue
            req("POST", "/programs/", {
                "station_id": station["id"],
                "name": p["name"], "days_of_week": p["days"],
                "start_time": p["start"], "end_time": p["end"],
                "timezone": "America/Sao_Paulo", "alert_recipients": [],
            })
            print(f"      · programa {p['name']} {p['start']}–{p['end']}")

    for s in stations_todo:
        print(f"  ⚠ {s['city']} — SEM stream_url/youtube_url no JSON (não capturada ainda)")

    # 5. Assinaturas (AEGEA nas suas próprias rádios, com city_filter = cidade)
    print(f"\n[5/5] Assinaturas ({len(created_stations)})...")
    for station_id, s in created_stations:
        code, res = req("POST", "/subscriptions/", {
            "station_id": station_id, "org_id": org_id, "city_filter": s["city"],
        })
        state = "criada" if code == 201 else ("já existe" if code == 409 else f"HTTP {code}")
        print(f"  ✓ {s['city']} → assinatura ({state})")

    print("\n" + "=" * 60)
    print("  ✅ Setup Aegea SC concluído")
    print(f"  Org ID: {org_id}")
    if stations_todo:
        print("\n  ⚠ FALTA PARA IR AO AR:")
        print("    - stream_url (ou youtube_url) + horários dos programas das rádios:")
        print("      " + ", ".join(s["city"] for s in stations_todo))
        print("    - telefones em 'alert_recipients' (e opcional 'recipients_by_theme')")
        print("    Edite config/clients/aegea_sc.json e rode este script de novo.")
    print("=" * 60)


if __name__ == "__main__":
    main()
