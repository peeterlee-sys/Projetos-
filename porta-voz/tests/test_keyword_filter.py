"""
O pré-filtro é só um gatilho — e keywords default (Itapema) não podem
vazar para clientes de outras cidades.
"""
from src.analyzer.keyword_filter import check_keywords


def test_org_com_keywords_proprias_nao_usa_defaults_de_itapema():
    """'xepa' e 'meia praia' são termos de Itapema — não podem disparar
    para uma org (ex: BC) que tem suas próprias keywords."""
    texto = "o prefeito alexandre xepa esteve na meia praia hoje"
    has_match, matched = check_keywords(texto, custom_keywords=["hospital", "juliana pavan"])
    assert not has_match
    assert matched == []


def test_org_sem_keywords_usa_defaults():
    has_match, matched = check_keywords(
        "a prefeitura de itapema anunciou obras", custom_keywords=None
    )
    assert has_match


def test_keywords_proprias_disparam_normalmente():
    has_match, matched = check_keywords(
        "problema no hospital municipal hoje de manhã",
        custom_keywords=["hospital", "upa"],
    )
    assert has_match
    assert "hospital" in matched


def test_normalizacao_de_acentos():
    has_match, matched = check_keywords(
        "reclamacao sobre pavimentacao",  # transcrição sem acento
        custom_keywords=["pavimentação"],
    )
    assert has_match
