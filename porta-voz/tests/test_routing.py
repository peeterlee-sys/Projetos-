"""
Testes do roteamento por cidade, deduplicação de assunto e formato do alerta.

Cobrem a parte DETERMINÍSTICA do pipeline (gates mecânicos, fusão de temas,
formatação). Os julgamentos do LLM (is_relevant, city_mentioned) são simulados
com os valores que o modelo deve retornar — as instruções correspondentes
ficam no prompt geográfico do claude_analyzer.

Rodar:  python3 tests/test_routing.py   (ou pytest)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.analyzer.keyword_filter import check_keywords, _normalize
from src.scheduler.monitor_job import _alert_theme_match
from src.alerts.formatter import format_alert_message
from src.analyzer.claude_analyzer import AnalysisResult
from src.core.config import settings


def _city_gate(monitored_city: str, city_mentioned: str) -> bool:
    """Réplica da checagem mecânica do monitor_job (2b): alerta só se a cidade
    atribuída pelo modelo contém a cidade monitorada."""
    return _normalize(monitored_city) in _normalize(city_mentioned or "")


def _mk_analysis(**over):
    base = dict(
        is_relevant=True, confidence_score=0.85, theme="Tema teste",
        sentiment="negative", urgency="high", content_type="complaint",
        source_type="listener_call", summary="Resumo.", excerpt="Trecho.",
        reason="Motivo.", suggested_action="Ação.", response_draft="",
        entities_mentioned=[], duration_ms=1, raw_response={},
    )
    base.update(over)
    return AnalysisResult(**base)


# ─── Cenário 1/2: conteúdo de uma cidade só alerta a cidade certa ─────────────

def test_hospital_bc_nao_vai_para_itapema():
    # Modelo atribui o hospital (Ruth Cardoso) a Balneário Camboriú
    assert _city_gate("Balneário Camboriú", "Balneário Camboriú") is True
    assert _city_gate("Itapema", "Balneário Camboriú") is False
    assert _city_gate("Itajaí", "Balneário Camboriú") is False


def test_prefeitura_itapema_so_para_itapema():
    assert _city_gate("Itapema", "Itapema") is True
    assert _city_gate("Balneário Camboriú", "Itapema") is False


# ─── Cenário 3: rádio regional, assunto de Itajaí ────────────────────────────

def test_radio_regional_assunto_itajai():
    for cidade, esperado in [("Itajaí", True), ("Itapema", False),
                             ("Balneário Camboriú", False)]:
        assert _city_gate(cidade, "Itajaí") is esperado


# ─── Cenário 4/5: regional genérico ou sem contexto → ninguém recebe ─────────

def test_conteudo_sem_cidade_clara_nao_alerta():
    for cidade in ("Itapema", "Balneário Camboriú", "Itajaí"):
        assert _city_gate(cidade, "incerta") is False
        assert _city_gate(cidade, "") is False


def test_confianca_baixa_nao_dispara():
    a = _mk_analysis(confidence_score=0.4)
    assert a.confidence_score < settings.ALERT_MIN_CONFIDENCE  # gate 4b suprime


# ─── Gating de keywords em rádio compartilhada (pré-análise) ─────────────────

def test_keyword_generica_nao_seleciona_cidade_errada():
    texto = "uma mãe foi com a criança ali no hospital e não tinha raio-x"
    # Sem cidade no trecho e sem keyword específica → org não entra na análise
    itapema_kw = ["prefeitura de itapema", "meia praia", "alexandre xepa"]
    city_hit = _normalize("Itapema") in _normalize(texto)
    kw_hit, _ = check_keywords(texto, custom_keywords=itapema_kw, include_defaults=False)
    assert not city_hit and not kw_hit


def test_cidade_nomeada_seleciona_a_org_certa():
    texto = "moradores de Itajaí reclamam da prefeitura de Itajaí"
    assert _normalize("Itajaí") in _normalize(texto)
    assert _normalize("Itapema") not in _normalize(texto)


# ─── Cenário 8: mesmo assunto duas vezes → um alerta só ──────────────────────

def test_mesmo_assunto_redigido_diferente_funde():
    variantes = [
        "Falta de equipamento (raio-x) em UPA/Hospital",
        "Reclamação sobre raio-x no hospital",
        "Raio-x indisponível na UPA municipal",
    ]
    for v in variantes[1:]:
        assert _alert_theme_match(variantes[0], v), f"não fundiu: {v}"


def test_assuntos_diferentes_nao_fundem():
    pares = [
        ("Falta de raio-x na UPA", "Obra parada no Ecoparque"),
        ("Falta de iluminação pública - Rua da Palha", "Falta de água no bairro Monte Alegre"),
        ("Denúncia: escola com teto em risco (Ilhota)", "Calendário escolar: recesso e retorno"),
    ]
    for a, b in pares:
        assert not _alert_theme_match(a, b), f"fundiu indevidamente: {a} × {b}"


# ─── Cenário 7 (formato): alerta identifica cliente e cidade ─────────────────

def test_alerta_mostra_cliente_e_cidade():
    msg = format_alert_message(
        _mk_analysis(city_mentioned="Balneário Camboriú"),
        station_name="Menina FM", program_name="Bote a Boca", chunk_time="08:04",
        org_name="Prefeitura de Balneário Camboriú",
    )
    assert "🏛️ *Cliente:* Prefeitura de Balneário Camboriú" in msg
    assert "🏙️ *Cidade:* Balneário Camboriú" in msg


def test_alerta_omite_cidade_incerta():
    msg = format_alert_message(
        _mk_analysis(city_mentioned="incerta"),
        station_name="Menina FM", program_name="Bote a Boca", chunk_time="08:04",
    )
    assert "🏙️" not in msg


# ─── Cenário 6 (áudio): janela de escuta cobre o assunto inteiro ─────────────

def test_janela_de_escuta_configurada():
    # 60s/bloco, ouve até 2min de silêncio do tema, máx. 10min por assunto
    assert settings.CHUNK_DURATION_SECONDS >= 60
    assert settings.ALERT_AGG_QUIET_SECONDS >= 120
    assert settings.ALERT_AGG_MAX_WINDOW_SECONDS >= 600


def _standalone():
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    passed = 0
    for t in tests:
        try:
            t()
            print(f"  ✓ {t.__name__}")
            passed += 1
        except AssertionError as e:
            print(f"  ✗ {t.__name__}: {e}")
    print(f"\n{passed}/{len(tests)} testes passaram.")
    return passed == len(tests)


if __name__ == "__main__":
    sys.exit(0 if _standalone() else 1)
