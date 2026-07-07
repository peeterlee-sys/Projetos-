"""
Cenário 8: mesmo assunto citado duas vezes no mesmo programa → sem alerta duplicado.
"""
from src.analyzer.deduplicator import build_dedup_hash, texts_are_similar


def test_hash_estavel_para_mesmo_assunto():
    h1 = build_dedup_hash("buraco na avenida", "complaint", "Menina FM")
    h2 = build_dedup_hash("Buraco na Avenida ", "complaint", "menina fm")
    assert h1 == h2


def test_hash_diferente_para_assuntos_diferentes():
    h1 = build_dedup_hash("buraco na avenida", "complaint", "Menina FM")
    h2 = build_dedup_hash("fila na upa", "complaint", "Menina FM")
    assert h1 != h2


def test_similaridade_captura_reformulacao_do_mesmo_assunto():
    assert texts_are_similar(
        "Fila de espera no hospital municipal de Balneário Camboriú",
        "Filas de espera no Hospital Municipal de Balneario Camboriu",
    )


def test_assuntos_distintos_nao_sao_similares():
    assert not texts_are_similar(
        "Fila de espera no hospital municipal",
        "Licitação de pavimentação da avenida beira-mar",
    )


def test_textos_vazios_nao_deduplicam():
    assert not texts_are_similar("", "qualquer coisa")
    assert not texts_are_similar(None, None)
