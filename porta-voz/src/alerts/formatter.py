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
    org_name: Optional[str] = None,
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
    ]
    if org_name:
        lines.append(f"🏛️ *Cliente:* {org_name}")
    city = getattr(analysis, "city_mentioned", "") or ""
    if city and city.lower() != "incerta":
        lines.append(f"🏙️ *Cidade:* {city}")
    lines += [
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


def _clip_stations(stations: list, limit: int = 2) -> str:
    stations = stations or []
    if not stations:
        return ""
    if len(stations) <= limit:
        return ", ".join(stations)
    return ", ".join(stations[:limit]) + f" +{len(stations) - limit}"


def format_clipping_message(
    org_name: str,
    date_str: str,
    items: list[dict],
    max_chars: int = 3500,
) -> list[str]:
    """
    Formata a CLIPAGEM DIÁRIA — assuntos relevantes captados no dia, agrupados.
    DESTAQUES (crítico/alto) vêm com resumo; DEMAIS (média/baixa) em uma linha.
    Usa o RESUMO do Claude (não a citação bruta). Retorna uma LISTA de mensagens
    já dividida para não estourar o limite do WhatsApp.

    Cada item: {time, theme, urgency, sentiment, content_type, summary, stations[]}
    """
    footer = f"_🤖 RADAR PÚBLICO · {_now_brt().strftime('%d/%m/%Y %H:%M')} BRT_"

    counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for it in items:
        counts[it.get("urgency", "low")] = counts.get(it.get("urgency", "low"), 0) + 1

    header = [
        "🗞️ *CLIPAGEM DIÁRIA*",
        f"🏛️ {org_name} · 📅 {date_str}",
        "",
        f"*{len(items)}* assunto(s) hoje · "
        f"🔴 {counts['critical']}  🟠 {counts['high']}  🟡 {counts['medium']}  🟢 {counts['low']}",
    ]

    if not items:
        return ["\n".join(header + ["", "Nenhuma menção relevante hoje.", "", footer])]

    destaques = [it for it in items if it.get("urgency") in ("critical", "high")]
    demais = [it for it in items if it.get("urgency") not in ("critical", "high")]

    lines: list[str] = list(header)

    if destaques:
        lines += ["", "━━━ ⚠️ *DESTAQUES* ━━━"]
        for it in destaques:
            u = _URGENCY_EMOJI.get(it.get("urgency"), "🟠")
            c = _CONTENT_TYPE_LABEL.get(it.get("content_type", "other"), "Outro")
            lines.append("")
            lines.append(f"{u} *{it.get('time','')}* · {it.get('theme','(sem tema)')}")
            if it.get("summary"):
                lines.append(it["summary"])
            meta = c
            st = _clip_stations(it.get("stations"))
            if st:
                meta += f" · 📻 {st}"
            lines.append(f"_{meta}_")

    if demais:
        lines += ["", "━━━ 📋 *DEMAIS MENÇÕES* ━━━"]
        for it in demais:
            u = _URGENCY_EMOJI.get(it.get("urgency"), "🟢")
            st = _clip_stations(it.get("stations"))
            tail = f" — {st}" if st else ""
            lines.append(f"{u} {it.get('time','')} · {it.get('theme','(sem tema)')}{tail}")

    lines += ["", footer]

    # Divide em várias mensagens respeitando max_chars, quebrando entre linhas
    messages: list[str] = []
    current: list[str] = []
    for ln in lines:
        candidate = current + [ln]
        if len("\n".join(candidate)) > max_chars and current:
            messages.append("\n".join(current))
            current = [f"🗞️ *CLIPAGEM (continuação)* — {org_name}", ""]
            current.append(ln)
        else:
            current = candidate
    if current:
        messages.append("\n".join(current))
    return messages
