"""
Formatação das mensagens de alerta WhatsApp.
Cria mensagens ricas com emojis e estrutura clara.
"""
from datetime import datetime
from typing import Optional

from src.analyzer.claude_analyzer import AnalysisResult


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
) -> str:
    """
    Formata mensagem de alerta WhatsApp com emojis e estrutura clara.

    Returns:
        Texto formatado para WhatsApp (sem markdown complexo, só emojis e newlines)
    """
    urgency = analysis.urgency
    emoji = _URGENCY_EMOJI.get(urgency, "🟡")
    urgency_label = _URGENCY_LABEL.get(urgency, urgency.upper())
    sentiment_label = _SENTIMENT_LABEL.get(analysis.sentiment, analysis.sentiment)
    content_label = _CONTENT_TYPE_LABEL.get(analysis.content_type, analysis.content_type)
    confidence_pct = int(analysis.confidence_score * 100)

    entities = ", ".join(analysis.entities_mentioned[:6]) if analysis.entities_mentioned else "—"

    lines = [
        f"{emoji} *ALERTA {urgency_label} — {station_name.upper()}*",
        "",
        f"📻 *Programa:* {program_name}",
        f"🕐 *Horário:* {chunk_time}",
        f"📌 *Tema:* {analysis.theme}",
        f"💬 *Tipo:* {content_label} | *Tom:* {sentiment_label}",
        f"⚡ *Urgência:* {urgency_label} (confiança: {confidence_pct}%)",
        "",
    ]

    if analysis.summary:
        lines += [
            "📝 *Resumo:*",
            analysis.summary,
            "",
        ]

    if analysis.excerpt:
        lines += [
            "🎯 *Trecho:*",
            f'_{analysis.excerpt[:400]}_',
            "",
        ]

    if analysis.reason:
        lines += [
            "⚠️ *Por que importa:*",
            analysis.reason,
            "",
        ]

    if analysis.suggested_action:
        lines += [
            "✅ *Ação sugerida:*",
            analysis.suggested_action,
            "",
        ]

    lines.append(f"👥 *Mencionados:* {entities}")
    lines.append(f"\n_🤖 PORTA VOZ · {datetime.utcnow().strftime('%d/%m %H:%M')} UTC_")

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
