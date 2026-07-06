"""
Geração de relatório consolidado ao final de cada sessão de monitoramento.
Consulta as análises da sessão e produz um resumo executivo.
"""
import re
import unicodedata
from datetime import datetime
from collections import Counter
from difflib import SequenceMatcher
from typing import Optional

import pytz

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.models import (
    MonitoringSession, Transcription, Analysis, Report,
    Sentiment, AlertStatus, Alert,
)
from src.analyzer.claude_analyzer import summarize_program
from src.core.logging_config import get_logger

logger = get_logger(__name__)

# Temas com similaridade acima destes limiares são tratados como o mesmo assunto.
_THEME_SIMILARITY_THRESHOLD = 0.72   # similaridade de string (difflib)
_THEME_TOKEN_JACCARD_THRESHOLD = 0.5  # sobreposição de palavras significativas

# Palavras muito comuns que não ajudam a distinguir temas.
_THEME_STOPWORDS = {
    "sobre", "para", "com", "sem", "dos", "das", "de", "do", "da", "no", "na",
    "nos", "nas", "em", "por", "que", "uma", "um", "e", "a", "o", "as", "os",
    "reclamacao", "denuncia", "entrevista", "mencao", "prefeitura", "municipal",
}


def _normalize_theme(theme: str) -> str:
    """Normaliza um tema para comparação: minúsculas, sem acento/pontuação."""
    t = unicodedata.normalize("NFKD", theme).encode("ascii", "ignore").decode("ascii")
    t = re.sub(r"[^a-z0-9\s]", " ", t.lower())
    return re.sub(r"\s+", " ", t).strip()


def _significant_tokens(theme: str) -> set[str]:
    return {
        w for w in _normalize_theme(theme).split()
        if len(w) >= 4 and w not in _THEME_STOPWORDS
    }


def _themes_similar(a: str, b: str) -> bool:
    na, nb = _normalize_theme(a), _normalize_theme(b)
    if not na or not nb:
        return False
    if na == nb or na in nb or nb in na:
        return True
    if SequenceMatcher(None, na, nb).ratio() >= _THEME_SIMILARITY_THRESHOLD:
        return True
    # Sobreposição de palavras significativas (pega mesmo assunto com redação diferente)
    ta, tb = _significant_tokens(a), _significant_tokens(b)
    if ta and tb:
        jaccard = len(ta & tb) / len(ta | tb)
        if jaccard >= _THEME_TOKEN_JACCARD_THRESHOLD:
            return True
    return False


def _canonicalize_themes(themes: list[str]) -> dict[str, str]:
    """
    Agrupa temas parecidos. Retorna um mapa {tema_original: tema_canônico},
    onde o canônico é a primeira (e geralmente mais completa) variação vista.
    """
    canonicals: list[str] = []
    mapping: dict[str, str] = {}
    for theme in themes:
        if theme in mapping:
            continue
        match = next((c for c in canonicals if _themes_similar(theme, c)), None)
        if match is None:
            # Mantém a variação mais longa como canônica (tende a ser a mais descritiva)
            canonicals.append(theme)
            mapping[theme] = theme
        else:
            # Se o novo é mais longo/descritivo, promove-o a canônico do grupo
            if len(theme) > len(match):
                for k, v in mapping.items():
                    if v == match:
                        mapping[k] = theme
                canonicals[canonicals.index(match)] = theme
                mapping[theme] = theme
            else:
                mapping[theme] = mapping.get(match, match)
    return mapping


async def generate_session_report(
    db: AsyncSession,
    session: MonitoringSession,
) -> Optional[Report]:
    """
    Gera relatório consolidado para uma sessão de monitoramento encerrada.
    Salva no banco e retorna o Report.
    """
    try:
        # Busca todas as transcrições da sessão para o resumo geral
        all_trans_result = await db.execute(
            select(Transcription)
            .where(Transcription.session_id == session.id)
            .order_by(Transcription.chunk_started_at)
        )
        all_transcriptions = all_trans_result.scalars().all()

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

        # Temas principais — agrupa variações parecidas do mesmo assunto
        themes = [a.theme for a in analyses if a.theme]
        theme_map = _canonicalize_themes(themes)
        canonical_themes = [theme_map[t] for t in themes]
        theme_counter = Counter(canonical_themes)
        key_topics = [t for t, _ in theme_counter.most_common(10)]

        # Sentimento predominante
        sentiments = [a.sentiment.value if a.sentiment else "neutral" for a in analyses]
        overall_sentiment = Counter(sentiments).most_common(1)[0][0] if sentiments else "neutral"

        # Timeline — colapsa entradas do mesmo tema canônico próximas no tempo.
        # chunk_started_at é UTC (naive); converte para o fuso do programa (BRT).
        program = session.program
        tz = pytz.timezone((program.timezone if program else None) or "America/Sao_Paulo")
        timeline = []
        seen_recent: dict[str, str] = {}  # tema canônico → "HH:MM" da última entrada
        for a in analyses:
            trans = a.transcription
            if not trans or not trans.chunk_started_at:
                continue
            canonical = theme_map.get(a.theme or "", a.theme or "")
            time_str = pytz.utc.localize(trans.chunk_started_at).astimezone(tz).strftime("%H:%M")
            # Evita repetir o mesmo assunto no mesmo minuto
            if seen_recent.get(canonical) == time_str:
                continue
            seen_recent[canonical] = time_str
            timeline.append({
                "time": time_str,
                "topic": canonical,
                "sentiment": a.sentiment.value if a.sentiment else "neutral",
                "urgency": a.urgency.value if a.urgency else "low",
                "excerpt": (a.excerpt or "")[:150],
                "content_type": a.content_type.value if a.content_type else "other",
            })

        # Recomendações consolidadas
        recommendations = _build_recommendations(analyses, alert_count, high_urgency_count)

        # Texto do resumo estatístico
        summary_text = _build_summary_text(
            session, total_relevant, alert_count, high_urgency_count, key_topics, overall_sentiment
        )

        # Resumo geral do programa gerado pelo Claude (todas as transcrições, não só as relevantes)
        program = session.program
        station = program.station if program else None
        duration_min = 0
        if session.started_at and session.ended_at:
            duration_min = int((session.ended_at - session.started_at).total_seconds() / 60)

        all_texts = [t.raw_text for t in all_transcriptions if t.raw_text and t.raw_text.strip()]
        general_summary = await summarize_program(
            texts=all_texts,
            station_name=station.name if station else "Rádio",
            program_name=program.name if program else "Programa",
            duration_min=duration_min,
        )

        report = Report(
            session_id=session.id,
            summary_text=summary_text,
            general_summary=general_summary,
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
