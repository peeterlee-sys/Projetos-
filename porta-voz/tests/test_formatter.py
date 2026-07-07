"""
Estrutura do alerta WhatsApp: modelo RADAR PÚBLICO com cidade correta,
justificativa de envio, horário BRT e referência de áudio.
"""
from datetime import datetime
from src.analyzer.claude_analyzer import AnalysisResult
from src.alerts.formatter import format_alert_message, format_operational_message, utc_to_brt_str


def _analysis(**overrides):
    base = dict(
        is_relevant=True,
        confidence_score=0.9,
        theme="Fila no hospital municipal",
        sentiment="negative",
        urgency="high",
        content_type="complaint",
        summary="Ouvinte reclama de fila no hospital municipal.",
        excerpt="tem gente esperando quatro horas no hospital",
        reason="Risco de desgaste para a gestão de saúde.",
        suggested_action="Preparar nota sobre o fluxo de atendimento.",
        entities_mentioned=["Hospital Municipal"],
        duration_ms=1200,
        raw_response={},
        primary_city="Balneário Camboriú",
        mentioned_cities=["Balneário Camboriú"],
        affected_cities=["Balneário Camboriú"],
        related_department="Secretaria de Saúde",
        city_confidence=0.92,
        city_reasoning="Hospital citado é o de BC.",
    )
    base.update(overrides)
    return AnalysisResult(**base)


def test_alerta_contem_campos_obrigatorios():
    msg = format_alert_message(
        analysis=_analysis(),
        station_name="Menina FM",
        program_name="Bote a Boca no Trombone",
        chunk_time="07/07/2026 08:15",
        city="Balneário Camboriú",
        routing_reason="Cidade principal do assunto é Balneário Camboriú.",
        audio_url="https://radar.exemplo.com/api/v1/clips/abc",
    )
    assert "RADAR PÚBLICO — ALERTA DE MÍDIA" in msg
    assert "*Cidade:* Balneário Camboriú" in msg
    assert "*Rádio:* Menina FM" in msg
    assert "*Programa:* Bote a Boca no Trombone" in msg
    assert "BRT" in msg
    assert "*Órgão relacionado:* Secretaria de Saúde" in msg
    assert "Por que este alerta foi enviado" in msg
    assert "https://radar.exemplo.com/api/v1/clips/abc" in msg


def test_aviso_operacional_classificado():
    msg = format_operational_message(
        station_name="JP News Litoral 106.1 FM",
        program_name="Jornal da Manhã",
        error_class="dns_failure",
        detail="Não foi possível resolver URL do stream",
        event_id="capture:fb543f57",
    )
    assert "AVISO OPERACIONAL" in msg
    assert "URL inválida ou DNS fora do ar" in msg
    assert "Verificar/atualizar a URL do stream" in msg
    assert "JP News Litoral" in msg


def test_conversao_utc_para_brt():
    # 12:00 UTC == 09:00 BRT
    assert utc_to_brt_str(datetime(2026, 7, 7, 12, 0)).endswith("09:00")
