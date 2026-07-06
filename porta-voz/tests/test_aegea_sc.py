"""
Testes offline do cliente Aegea SC.

Não chamam a API do Claude (isso exigiria rede/custo). Validam o que dá para
validar deterministicamente:
  1. Integridade da config editável (config/clients/aegea_sc.json).
  2. Montagem de master_prompt / system_prompt / keywords.
  3. Comportamento do PRÉ-FILTRO de palavras-chave nos exemplos simulados do
     Prompt Mestre — ou seja, quais trechos chegariam ao classificador Claude.

Os exemplos de classificação fina (should_alert, severity, service_area...) do
Prompt Mestre ficam documentados aqui como fixtures para validação manual com o
LLM, mas não são asseridos automaticamente.

Rodar:  python3 -m pytest tests/test_aegea_sc.py -v
   ou:  python3 tests/test_aegea_sc.py   (modo standalone, sem pytest)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.analyzer.keyword_filter import check_keywords

# Importa o módulo de setup para reaproveitar a montagem
import importlib.util

_spec = importlib.util.spec_from_file_location(
    "setup_aegea_sc",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                 "scripts", "setup_aegea_sc.py"),
)
setup_aegea = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(setup_aegea)

CFG = setup_aegea.load_config()
KEYWORDS = setup_aegea.build_keywords(CFG)


# ─── 1. Integridade da config ─────────────────────────────────────────────────

def test_config_tem_campos_obrigatorios():
    for campo in ("client_id", "org_name", "geo_filter", "units",
                  "sensitive_themes", "neighborhoods", "current_as_of"):
        assert campo in CFG, f"faltando '{campo}' na config"
    assert CFG["client_id"] == "aegea_sc"
    assert CFG["geo_filter"]["include_state"] == "SC"


def test_seis_cidades_e_unidades():
    cidades = set(CFG["geo_filter"]["cities"])
    esperado = {"Bombinhas", "Camboriú", "Palhoça", "Penha",
                "São Francisco do Sul", "Brusque"}
    assert cidades == esperado
    # toda cidade tem unidade e bairros
    unidade_cidades = {u["city"] for u in CFG["units"]}
    assert esperado <= unidade_cidades
    for c in esperado:
        assert c in CFG["neighborhoods"] and CFG["neighborhoods"][c]


def test_prompts_montam():
    mp = setup_aegea.build_master_prompt(CFG)
    sp = setup_aegea.build_system_prompt(CFG)
    assert "Santa Catarina" in mp and "Águas de Camboriú" in mp
    assert "REGRA GEOGRÁFICA" in sp
    # a escala de urgência tem que estar mapeada no schema atual
    for nivel in ("critical", "high", "medium", "low"):
        assert nivel in sp


def test_keywords_sem_duplicatas_e_cobrem_temas():
    lowered = [k.lower() for k in KEYWORDS]
    assert len(lowered) == len(set(lowered)), "keywords duplicadas"
    for termo in ("aegea", "águas de bombinhas", "falta de água",
                  "esgoto na rua", "conta alta", "vazamento"):
        assert termo in lowered, f"keyword esperada ausente: {termo}"


# ─── 2. Pré-filtro nos exemplos simulados ─────────────────────────────────────
# (has_match=True significa: o trecho chegaria ao Claude para classificação.)

CASOS_DEVE_PASSAR = [
    ("falta de água em Bombinhas",
     "Moradores de Bombinhas reclamam que estão sem água desde ontem e dizem que a Águas de Bombinhas ainda não deu previsão."),
    ("baixa pressão em Camboriú",
     "Ouvinte de Camboriú diz que a pressão da água está muito fraca no bairro Monte Alegre."),
    ("água suja em Palhoça",
     "Moradora de Palhoça relatou água barrenta saindo da torneira."),
    ("esgoto na praia em Penha",
     "Tem esgoto voltando e mau cheiro perto da praia de Armação, em Penha."),
    ("mau cheiro em São Francisco do Sul",
     "Reclamação de mau cheiro perto da estação de tratamento em São Francisco do Sul."),
    ("obra de esgoto em Brusque",
     "A Câmara de Brusque discutiu a concessão de esgotamento sanitário e cobrou transparência."),
    ("conta alta",
     "Consumidor reclama de conta de água muito alta e cobrança que considera indevida."),
    ("hidrômetro",
     "Ouvinte diz que o hidrômetro está girando sozinho e a leitura veio errada."),
    ("vereador critica concessionária",
     "Vereador de Penha cobrou explicações da Águas de Penha sobre a taxa de esgoto."),
    ("prefeito cobra solução",
     "O prefeito cobrou a concessionária de água por causa da falta de água na cidade."),
    ("procon acionado",
     "O Procon foi acionado por causa de cobrança de esgoto sem serviço prestado."),
    ("mpsc citado",
     "O Ministério Público de Santa Catarina abriu apuração sobre a concessionária de esgoto."),
    ("elogio a atendimento",
     "O apresentador elogiou a equipe da Águas de Camboriú por resolver rápido um vazamento no Tabuleiro."),
]

# O pré-filtro é propositalmente amplo (recall > precisão); o FILTRO FINO de
# geografia (ignorar fora de SC) é responsabilidade do Claude via system_prompt.
# Aqui só garantimos que trechos claramente irrelevantes de saneamento NÃO passam.
CASOS_NAO_PASSA = [
    ("previsão do tempo",
     "A previsão indica sol forte e mar calmo para o fim de semana na região."),
    ("esporte",
     "O time venceu por dois a zero e assumiu a liderança do campeonato."),
]


def test_prefiltro_deixa_passar_relevantes():
    falhas = []
    for nome, texto in CASOS_DEVE_PASSAR:
        has_match, matched = check_keywords(texto, custom_keywords=KEYWORDS)
        if not has_match:
            falhas.append(nome)
    assert not falhas, f"pré-filtro barrou trechos relevantes: {falhas}"


def test_prefiltro_barra_irrelevantes():
    for nome, texto in CASOS_NAO_PASSA:
        has_match, _ = check_keywords(texto, custom_keywords=KEYWORDS, include_defaults=False)
        assert not has_match, f"pré-filtro deixou passar trecho irrelevante: {nome}"


# ─── Fixtures de classificação fina (validação manual com LLM) ─────────────────
# Cada caso: texto → expectativa (o Claude deve chegar a algo equivalente).
CASOS_LLM = [
    {"texto": "A Águas do Rio anunciou investimento em comunidades do Rio de Janeiro.",
     "is_relevant": False, "motivo": "operação fora de SC"},
    {"texto": "A Aegea foi citada como exemplo nacional de saneamento, sem relação com SC.",
     "is_relevant": False, "save_to_report": True, "urgency": "low"},
    {"texto": "Turistas reclamam de falta de água em Bombas no meio da temporada.",
     "is_relevant": True, "urgency": "critical", "sentiment": "negative"},
]


def _standalone():
    testes = [v for k, v in globals().items() if k.startswith("test_") and callable(v)]
    passou = 0
    for t in testes:
        try:
            t()
            print(f"  ✓ {t.__name__}")
            passou += 1
        except AssertionError as e:
            print(f"  ✗ {t.__name__}: {e}")
    print(f"\n{passou}/{len(testes)} testes passaram.")
    print(f"(+{len(CASOS_LLM)} fixtures de classificação LLM para validação manual)")
    return passou == len(testes)


if __name__ == "__main__":
    ok = _standalone()
    sys.exit(0 if ok else 1)
