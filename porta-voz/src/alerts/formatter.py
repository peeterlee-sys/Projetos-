"""
Formatação das mensagens de alerta WhatsApp.
Cria mensagens ricas com emojis e estrutura clara.
"""
from datetime import datetime
from typing import Optional

import pytz

from src.analyzer.claude_analyzer import AnalysisResult

_BRT = pytz.timezone("America/Sao_Paulo")


def _now_brt() -> datetime:
    return datetime.utcnow().replace(tzinfo=pytz.utc).astimezone(_BRT)


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

_SOURCE_TYPE_LABEL = {
    "listener_call": "📞 Ouvinte ao vivo",
    "interview": "🎤 Entrevista",
    "report": "📰 Reportagem",
    "editorial": "🗣️ Editorial/Comentário",
    "other": "📻 Programa",
}

_ORDINAL = ["", "1ª", "2ª", "3ª", "4ª", "5ª", "6ª", "7ª", "8ª", "9ª", "10ª"]


def format_alert_message(
    analysis: AnalysisResult,
    station_name: str,
    program_name: str,
    chunk_time: str,
    recurrence_count: int = 0,
    cross_radio_stations: Optional[list] = None,
    dashboard_url: str = "",
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
    source_label = _SOURCE_TYPE_LABEL.get(getattr(analysis, "source_type", "other"), "📻 Programa")
    confidence_pct = int(analysis.confidence_score * 100)

    entities = ", ".join(analysis.entities_mentioned[:6]) if analysis.entities_mentioned else "—"

    lines = [
        f"{emoji} *ALERTA {urgency_label} — {station_name.upper()}*",
        "",
        f"📻 *Programa:* {program_name}",
        f"🕐 *Horário:* {chunk_time}",
        f"🎙️ *Fonte:* {source_label}",
        f"📌 *Tema:* {analysis.theme}",
        f"💬 *Tipo:* {content_label} | *Tom:* {sentiment_label}",
        f"⚡ *Urgência:* {urgency_label} (confiança: {confidence_pct}%)",
    ]

    if recurrence_count > 0:
        ordinal = _ORDINAL[min(recurrence_count + 1, len(_ORDINAL) - 1)]
        lines.append(f"🔁 *{ordinal} menção a este tema em 7 dias*")

    if cross_radio_stations:
        stations_str = ", ".join(cross_radio_stations[:3])
        lines.append(f"📡 *Também detectado hoje:* {stations_str}")

    lines.append("")

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

    response_draft = getattr(analysis, "response_draft", "")
    if response_draft:
        lines += [
            "📋 *Minuta sugerida:*",
            f'"{response_draft}"',
            "",
        ]

    lines.append(f"👥 *Mencionados:* {entities}")

    if dashboard_url:
        lines.append(f"🔗 {dashboard_url}")

    lines.append(f"\n_🤖 RADAR PÚBLICO · {_now_brt().strftime('%d/%m %H:%M')} BRT_")

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

    lines.append(f"_🤖 RADAR PÚBLICO · {_now_brt().strftime('%d/%m/%Y %H:%M')} BRT_")

    return "\n".join(lines)


def format_clipping_message(
    org_name: str,
    date_str: str,
    items: list[dict],
    max_chars: int = 3500,
) -> list[str]:
    """
    Formata a CLIPAGEM DIÁRIA — toda menção relevante captada no dia, em ordem
    cronológica (estilo clipping). Retorna uma LISTA de mensagens já dividida
    para não estourar o limite do WhatsApp.

    Cada item: {time, station, program, city, theme, urgency, sentiment,
                content_type, excerpt}
    """
    header = [
        "🗞️ *CLIPAGEM DIÁRIA*",
        f"🏛️ {org_name}",
        f"📅 {date_str}",
        "",
        f"*{len(items)}* menção(ões) relevante(s) captada(s) hoje nas rádios.",
        "─" * 28,
    ]
    footer = f"_🤖 RADAR PÚBLICO · {_now_brt().strftime('%d/%m/%Y %H:%M')} BRT_"

    if not items:
        return ["\n".join(header + ["", "Nenhuma menção relevante hoje.", "", footer])]

    blocks: list[str] = []
    for it in items:
        urg = it.get("urgency", "low")
        u_emoji = _URGENCY_EMOJI.get(urg, "🟢")
        u_label = _URGENCY_LABEL.get(urg, "BAIXA")
        s_label = _SENTIMENT_LABEL.get(it.get("sentiment", "neutral"), "➖ Neutro")
        c_label = _CONTENT_TYPE_LABEL.get(it.get("content_type", "other"), "Outro")
        loc = f" · 📍 {it['city']}" if it.get("city") else ""
        line = [
            f"{u_emoji} *{it.get('time','')}* · {it.get('station','')} — {it.get('program','')}{loc}",
            f"{c_label} · {s_label} · Urgência: {u_label}",
        ]
        if it.get("theme"):
            line.append(f"🏷 {it['theme']}")
        if it.get("excerpt"):
            line.append(f"“{it['excerpt']}”")
        blocks.append("\n".join(line))

    # Divide em várias mensagens respeitando max_chars
    messages: list[str] = []
    current = list(header)
    current_len = len("\n".join(current))
    for i, block in enumerate(blocks):
        add_len = len(block) + 2
        if current_len + add_len > max_chars and len(current) > len(header):
            current.append("")
            current.append(f"_(continua…)_")
            messages.append("\n".join(current))
            current = [f"🗞️ *CLIPAGEM DIÁRIA (continuação)* — {org_name}", "─" * 28]
            current_len = len("\n".join(current))
        current.append("")
        current.append(block)
        current_len += add_len

    current.append("")
    current.append(footer)
    messages.append("\n".join(current))
    return messages
