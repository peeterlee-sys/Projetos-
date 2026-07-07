"""
Formatação das mensagens de alerta WhatsApp.
Cria mensagens ricas com emojis e estrutura clara. Horários em BRT.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional

from src.analyzer.claude_analyzer import AnalysisResult

_BRT = timezone(timedelta(hours=-3))


def _now_brt() -> str:
    return datetime.now(tz=_BRT).strftime("%d/%m/%Y %H:%M")


def utc_to_brt_str(dt: Optional[datetime]) -> str:
    """Converte um datetime UTC (naive) para string BRT dd/mm HH:MM."""
    if not dt:
        return _now_brt()
    aware = dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
    return aware.astimezone(_BRT).strftime("%d/%m/%Y %H:%M")


_URGENCY_EMOJI = {
    "critical": "🔴",
    "high": "🟠",
    "medium": "🟡",
    "low": "🟢",
}

_URGENCY_LABEL = {
    "critical": "CRÍTICO",
    "high": "ALTA",
    "medium": "MÉDIA",
    "low": "BAIXA",
}

_SENTIMENT_LABEL = {
    "positive": "✅ Positivo",
    "negative": "⚠️ Negativo",
    "neutral": "➖ Neutro",
}

_CONTENT_TYPE_LABEL = {
    "complaint": "Reclamação",
    "denouncement": "Denúncia",
    "praise": "Elogio",
    "interview": "Entrevista",
    "criticism": "Crítica",
    "institutional": "Institucional",
    "political": "Político",
    "other": "Outro",
}


def format_alert_message(
    analysis: AnalysisResult,
    station_name: str,
    program_name: str,
    chunk_time: str,
    city: Optional[str] = None,
    routing_reason: Optional[str] = None,
    audio_note: Optional[str] = None,
    audio_url: Optional[str] = None,
    transcription_note: Optional[str] = None,
) -> str:
    """
    Formata o alerta de mídia no modelo padrão do RADAR PÚBLICO:
    cidade correta, contexto, justificativa de envio e referência de áudio.
    """
    urgency = analysis.urgency
    emoji = _URGENCY_EMOJI.get(urgency, "🟡")
    urgency_label = _URGENCY_LABEL.get(urgency, urgency.upper())

    lines = [
        f"{emoji} *RADAR PÚBLICO — ALERTA DE MÍDIA*",
        "",
        f"*Cidade:* {city or '—'}",
        f"*Rádio:* {station_name}",
        f"*Programa:* {program_name}",
        f"*Horário:* {chunk_time} BRT",
        f"*Tema:* {analysis.theme or '—'}",
        f"*Órgão relacionado:* {analysis.related_department or '—'}",
        f"*Nível de relevância:* {urgency_label}",
        "",
    ]

    if analysis.summary:
        lines += ["*Resumo:*", analysis.summary, ""]

    if analysis.excerpt:
        lines += ["*Trecho relevante:*", f'_"{analysis.excerpt[:400]}"_', ""]

    why = routing_reason or analysis.reason
    if why:
        lines += ["*Por que este alerta foi enviado:*", why, ""]

    if analysis.suggested_action:
        lines += ["*Ação sugerida:*", analysis.suggested_action, ""]

    audio_lines = []
    if audio_note:
        audio_lines.append(audio_note)
    if audio_url:
        audio_lines.append(f"Áudio completo: {audio_url}")
    if audio_lines:
        lines += ["*Áudio:*"] + audio_lines + [""]

    if transcription_note:
        lines += ["*Transcrição:*", transcription_note, ""]

    lines.append(f"_🤖 RADAR PÚBLICO · {_now_brt()} BRT_")

    return "\n".join(lines)


# Classificação de falha → texto amigável + ação recomendada
_FAILURE_LABELS = {
    "dns_failure": ("URL inválida ou DNS fora do ar", "Verificar/atualizar a URL do stream"),
    "invalid_url": ("URL do stream inválida", "Cadastrar nova URL de stream"),
    "timeout": ("Falha temporária (timeout de conexão)", "Aguardar — o sistema tentará reconectar"),
    "http_error": ("Servidor da rádio recusou a conexão", "Confirmar se o stream mudou de endereço"),
    "format_error": ("Formato de stream incompatível", "Verificar codec/formato do stream"),
    "stream_offline": ("Rádio realmente fora do ar", "Confirmar com a emissora"),
    "system_error": ("Erro do nosso sistema", "Precisa de ação humana — verificar logs"),
    "unknown": ("Falha não classificada", "Precisa de ação humana — verificar logs"),
}


def format_operational_message(
    station_name: str,
    program_name: str,
    error_class: str,
    detail: str,
    event_id: str,
    when: Optional[datetime] = None,
) -> str:
    """Aviso operacional classificado (falha temporária vs URL inválida vs ação humana)."""
    label, action = _FAILURE_LABELS.get(error_class, _FAILURE_LABELS["unknown"])
    lines = [
        "⚙️ *RADAR PÚBLICO — AVISO OPERACIONAL*",
        "",
        f"*Rádio/Programa:* {station_name} — {program_name}",
        f"*Diagnóstico:* {label}",
        f"*Detalhe:* {detail[:200]}",
        f"*Ação recomendada:* {action}",
        "",
        f"_{utc_to_brt_str(when)} BRT · evento: {event_id}_",
    ]
    return "\n".join(lines)


def format_report_message(
    program_name: str,
    station_name: str,
    duration_minutes: int,
    total_chunks: int,
    relevant_count: int,
    alert_count: int,
    high_urgency_count: int,
    key_topics: list,
    timeline: list,
    recommendations: list,
    overall_sentiment: Optional[str] = None,
    general_summary: Optional[str] = None,
) -> str:
    """Formata mensagem de relatório de fim de programa."""
    sentiment_label = _SENTIMENT_LABEL.get(overall_sentiment or "neutral", "➖ Neutro")

    lines = [
        "📊 *RELATÓRIO DE MONITORAMENTO*",
        "",
        f"📻 *{station_name}* — {program_name}",
        f"⏱ Duração monitorada: {duration_minutes} min",
        "",
    ]

    if general_summary:
        lines += [
            "🗞 *O que foi ao ar hoje:*",
            general_summary,
            "",
        ]

    lines += [
        "─" * 30,
        "",
        "📈 *Monitoramento:*",
        f"• Trechos analisados: {total_chunks}",
        f"• Menções relevantes: {relevant_count}",
        f"• Alertas enviados: {alert_count}",
        f"• Alta urgência: {high_urgency_count}",
    ]

    if relevant_count > 0:
        lines.append(f"• Tom geral: {sentiment_label}")

    lines.append("")

    if key_topics:
        lines.append("🏷 *Principais temas:*")
        for i, topic in enumerate(key_topics[:5], 1):
            lines.append(f"  {i}. {topic}")
        lines.append("")

    if timeline:
        lines.append("📋 *Timeline:*")
        for item in timeline[:8]:
            t = item.get("time", "")
            topic = item.get("topic", "")
            sentiment = item.get("sentiment", "")
            s_emoji = {"positive": "✅", "negative": "⚠️", "neutral": "➖"}.get(sentiment, "➖")
            lines.append(f"  {t} {s_emoji} {topic}")
        lines.append("")

    if recommendations:
        lines.append("💡 *Recomendações:*")
        for rec in recommendations[:3]:
            lines.append(f"• {rec}")
        lines.append("")

    lines.append(f"_🤖 PORTA VOZ · {datetime.utcnow().strftime('%d/%m/%Y %H:%M')} UTC_")

    return "\n".join(lines)
