"""
Testes do roteamento por cidade contratada — cenários obrigatórios do RADAR PÚBLICO.
"""
from src.analyzer.city_router import (
    decide_routing, normalize_city,
    ACTION_SEND, ACTION_REVIEW, ACTION_BLOCK,
)


def test_cenario_1_hospital_bc_vai_somente_para_bc():
    """Conteúdo sobre Balneário Camboriú com palavra 'hospital':
    envia para BC, bloqueia para Itapema."""
    kwargs = dict(
        primary_city="Balneário Camboriú",
        affected_cities=["Balneário Camboriú"],
        city_confidence=0.92,
    )
    bc = decide_routing(contracted_city="Balneário Camboriú", **kwargs)
    itapema = decide_routing(contracted_city="Itapema", **kwargs)

    assert bc.action == ACTION_SEND
    assert bc.matched_as == "primary"
    assert itapema.action == ACTION_BLOCK
    assert not itapema.should_send


def test_cenario_2_prefeitura_itapema_vai_somente_para_itapema():
    kwargs = dict(
        primary_city="Itapema",
        affected_cities=["Itapema"],
        city_confidence=0.9,
    )
    itapema = decide_routing(contracted_city="Itapema", **kwargs)
    camboriu = decide_routing(contracted_city="Camboriú", **kwargs)

    assert itapema.action == ACTION_SEND
    assert camboriu.action == ACTION_BLOCK


def test_cenario_3_radio_regional_assunto_de_itajai():
    """Rádio regional cita várias cidades, mas o assunto é de Itajaí:
    envia só para Itajaí."""
    kwargs = dict(
        primary_city="Itajaí",
        affected_cities=["Itajaí"],
        city_confidence=0.88,
    )
    itajai = decide_routing(contracted_city="Itajaí", **kwargs)
    bc = decide_routing(contracted_city="Balneário Camboriú", **kwargs)
    itapema = decide_routing(contracted_city="Itapema", **kwargs)

    assert itajai.action == ACTION_SEND
    assert bc.action == ACTION_BLOCK
    assert itapema.action == ACTION_BLOCK


def test_cenario_3b_assunto_regional_afetando_duas_cidades_explicitamente():
    """Assunto regional citando duas cidades explicitamente afetadas:
    pode ir para as duas, mas não para uma terceira."""
    kwargs = dict(
        primary_city="Itajaí",
        affected_cities=["Itajaí", "Balneário Camboriú"],
        city_confidence=0.85,
    )
    bc = decide_routing(contracted_city="Balneário Camboriú", **kwargs)
    itapema = decide_routing(contracted_city="Itapema", **kwargs)

    assert bc.action == ACTION_SEND
    assert bc.matched_as == "affected"
    assert itapema.action == ACTION_BLOCK


def test_cenario_4_regional_generico_sem_cidade_vai_para_revisao():
    """Conteúdo regional genérico sem cidade claramente afetada:
    não envia — revisão interna."""
    decision = decide_routing(
        contracted_city="Itapema",
        primary_city=None,
        affected_cities=[],
        city_confidence=0.3,
    )
    assert decision.action == ACTION_REVIEW
    assert not decision.should_send


def test_cenario_5_mencao_curta_baixa_confianca_nao_envia():
    """Menção curta sem contexto suficiente → baixa confiança → revisão."""
    decision = decide_routing(
        contracted_city="Itapema",
        primary_city="Itapema",
        affected_cities=["Itapema"],
        city_confidence=0.4,
    )
    assert decision.action == ACTION_REVIEW
    assert decision.matched_as == "primary"


def test_org_sem_cidade_configurada_vai_para_revisao():
    decision = decide_routing(
        contracted_city=None,
        primary_city="Itapema",
        affected_cities=["Itapema"],
        city_confidence=0.9,
    )
    assert decision.action == ACTION_REVIEW


def test_normalizacao_acentos_e_caixa():
    assert normalize_city("Balneário Camboriú") == normalize_city("balneario camboriu")
    decision = decide_routing(
        contracted_city="BALNEARIO CAMBORIU",
        primary_city="Balneário Camboriú",
        affected_cities=[],
        city_confidence=0.9,
    )
    assert decision.action == ACTION_SEND
