"""
Cenário 7: stream com URL inválida → falha registrada e classificada corretamente.
"""
from src.health.failure_classifier import classify_failure


def test_dns_failure():
    c = classify_failure("ffmpeg: Name or service not known: radiofm.exemplo.br")
    assert c.error_class == "dns_failure"
    assert c.needs_human


def test_url_invalida_404():
    c = classify_failure("Server returned 404 Not Found")
    assert c.error_class == "invalid_url"
    assert c.needs_human


def test_resolve_falhou_mensagem_portugues():
    c = classify_failure("Não foi possível resolver URL do stream")
    assert c.error_class == "dns_failure"


def test_timeout_e_transitorio():
    c = classify_failure("Connection timed out after 15000 ms")
    assert c.error_class == "timeout"
    assert c.is_transient
    assert not c.needs_human


def test_stream_fora_do_ar():
    c = classify_failure("Connection refused")
    assert c.error_class == "stream_offline"
    assert c.is_transient


def test_formato_incompativel():
    c = classify_failure("Invalid data found when processing input")
    assert c.error_class == "format_error"
    assert c.needs_human


def test_erro_desconhecido_precisa_de_humano():
    c = classify_failure("algum erro totalmente novo xyz")
    assert c.error_class == "unknown"
    assert c.needs_human
