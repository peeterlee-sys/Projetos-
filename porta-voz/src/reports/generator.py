"""
Geração de relatório consolidado ao final de cada sessão de monitoramento.
Consulta as análises da sessão e produz um resumo executivo.
"""
from datetime import datetime
from collections import Counter
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.models import (
    MonitoringSession, Transcription, Analysis, Report,
    Sentiment, AlertStatus, Alert,
)
from src.core.logging_config import get_logger

logger = get_logger(__name__)


async def generate_session_report(
    db: AsyncSession,
    session: MonitoringSession,
) -> Optional[Report]:
    """
    Gera relatório consolidado para uma sessão de monitoramento encerrada.
    Salva no banco e retorna o Report.
    """
    try:
        # Busca todas as análises relevantes da sessão
        result = await db.execute(
            select(Analysis)
            .join(Transcription, Analysis.transcription_id == Transcription.id)
            .where(
                Transcription.session_id == session.id,
                Analysis.is_relevant == True,
            )
            .order_by(Transcription.chunk_started_at)
        )
        analyses = result.scalars().all()

        alert_result = await db.execute(
            select(Alert).where(
                Alert.session_id == session.id,
                Alert.status == AlertStatus.sent,
            )
        )
        sent_alerts = alert_result.scalars().all()

        total_relevant = len(analyses)
        alert_count = len(sent_alerts)
        high_urgency_count = sum(
            1 for a in analyses if a.urgency in ("high", "critical")
        )

        # Temas principais
        themes = [a.theme for a in analyses if a.theme]
        theme_counter = Counter(themes)
        key_topics = [t for t, _ in theme_counter.most_common(10)]

        # Sentimento predominante
        sentiments = [a.sentiment.value if a.sentiment else "neutral" for a in analyses]
        overall_sentiment = Counter(sentiments).most_common(1)[0][0] if sentiments else "neutral"

        # Timeline
        timeline = []
        for a in analyses:
            trans = a.transcription
            if trans and trans.chunk_started_at:
                timeline.append({
                    "time": trans.chunk_started_at.strftime("%H:%M"),
                    "topic": a.theme or "",
                    "sentiment": a.sentiment.value if a.sentiment else "neutral",
                    "urgency": a.urgency.value if a.urgency else "low",
                    "excerpt": (a.excerpt or "")[:150],
                    "content_type": a.content_type.value if a.content_type else "other",
                })

        # Recomendações consolidadas
        recommendations = _build_recommendations(analyses, alert_count, high_urgency_count)

        # Texto do resumo
        summary_text = _build_summary_text(
            session, total_relevant, alert_count, high_urgency_count, key_topics, overall_sentiment
        )

        report = Report(
            session_id=session.id,
            summary_text=summary_text,
            key_topics=key_topics,
            overall_sentiment=Sentiment(overall_sentiment),
            total_mentions=total_relevant,
            alert_count=alert_count,
            high_urgency_count=high_urgency_count,
            recommendations=recommendations,
            timeline=timeline,
            generated_at=datetime.utcnow(),
        )

        db.add(report)
        await db.commit()
        await db.refresh(report)

        logger.info(
            "report.generated",
            session_id=session.id,
            total_relevant=total_relevant,
            alert_count=alert_count,
        )

        return report

    except Exception as e:
        logger.error("report.generation_failed", session_id=session.id, error=str(e))
        await db.rollback()
        return None


def _build_recommendations(analyses: list, alert_count: int, high_urgency_count: int) -> list:
    recs = []

    urgency_counts = Counter(
        a.urgency.value if a.urgency else "low" for a in analyses
    )

    if urgency_counts.get("critical", 0) > 0:
        recs.append("Atenção imediata: há conteúdo crítico que exige resposta da comunicação.")

    if urgency_counts.get("high", 0) > 2:
        recs.append("Alta frequência de menções negativas. Considere nota pública ou contato com a rádio.")

    content_types = Counter(
        a.content_type.value if a.content_type else "other" for a in analyses
    )

    if content_types.get("denouncement", 0) > 0:
        recs.append("Há denúncias registradas. Envolva a assessoria jurídica e apure os fatos.")

    if content_types.get("praise", 0) > 2:
        recs.append("Boa cobertura positiva: aproveite para amplificar nas redes sociais.")

    if content_types.get("interview", 0) > 0:
        recs.append("Entrevista com autoridade identificada — salve o áudio completo.")

    suggested_actions = [
        a.suggested_action for a in analyses
        if a.suggested_action and a.urgency and a.urgency.value in ("high", "critical")
    ]
    if suggested_actions:
        recs.append(suggested_actions[0])

    return recs[:5]


def _build_summary_text(
    session: MonitoringSession,
    total_relevant: int,
    alert_count: int,
    high_urgency: int,
    key_topics: list,
    overall_sentiment: str,
) -> str:
    program = session.program
    station = program.station if program else None

    station_name = station.name if station else "Desconhecida"
    program_name = program.name if program else "Desconhecido"

    duration_min = 0
    if session.started_at and session.ended_at:
        duration_min = int((session.ended_at - session.started_at).total_seconds() / 60)

    sentiment_pt = {"positive": "positivo", "negative": "negativo", "neutral": "neutro"}.get(
        overall_sentiment, "neutro"
    )

    top_topics = ", ".join(key_topics[:3]) if key_topics else "nenhum destaque"

    return (
        f"Monitoramento de {program_name} ({station_name}) por {duration_min} minutos. "
        f"{total_relevant} trecho(s) relevante(s) identificado(s), {alert_count} alerta(s) enviado(s), "
        f"{high_urgency} de alta urgência. Tom geral: {sentiment_pt}. "
        f"Principais temas: {top_topics}."
    )
