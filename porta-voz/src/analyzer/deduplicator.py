"""
Deduplicação de alertas: evita notificações repetidas do mesmo tema
dentro de uma janela de tempo configurável.

Duas camadas:
1. Hash exato (tema normalizado + tipo + rádio + org).
2. Similaridade textual entre tema/resumo de alertas recentes da mesma
   org/rádio — captura o mesmo assunto reformulado em outro chunk.
"""
import hashlib
import unicodedata
from datetime import datetime, timedelta
from difflib import SequenceMatcher
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.models import Alert, AlertStatus, Analysis
from src.core.config import settings
from src.core.logging_config import get_logger

logger = get_logger(__name__)


def _normalize_text(text: str) -> str:
    text = (text or "").lower().strip()
    text = unicodedata.normalize("NFD", text).encode("ascii", "ignore").decode("ascii")
    return " ".join(text.split())


def texts_are_similar(a: str, b: str, threshold: Optional[float] = None) -> bool:
    """Compara dois textos curtos (tema/resumo) por similaridade de sequência."""
    threshold = threshold if threshold is not None else settings.DEDUP_SIMILARITY_THRESHOLD
    na, nb = _normalize_text(a), _normalize_text(b)
    if not na or not nb:
        return False
    return SequenceMatcher(None, na, nb).ratio() >= threshold


def build_dedup_hash(theme: str, content_type: str, station_name: str) -> str:
    """
    Gera hash para deduplicação baseado no tema + tipo + rádio.
    Garante que o mesmo assunto na mesma rádio não gere múltiplos alertas.
    """
    normalized = f"{theme.lower().strip()}|{content_type}|{station_name.lower().strip()}"
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


async def is_duplicate(
    db: AsyncSession,
    session_id: str,
    dedup_hash: str,
    window_minutes: Optional[int] = None,
) -> bool:
    """
    Verifica se já foi enviado um alerta com o mesmo hash dentro da janela de tempo.

    Args:
        db: AsyncSession do banco
        session_id: ID da sessão atual (para escopo de logs)
        dedup_hash: Hash do alerta candidato
        window_minutes: Janela de deduplicação (padrão: DEDUP_WINDOW_MINUTES)

    Returns:
        True se é duplicata e deve ser suprimido
    """
    window = window_minutes or settings.DEDUP_WINDOW_MINUTES
    cutoff = datetime.utcnow() - timedelta(minutes=window)

    result = await db.execute(
        select(Alert).where(
            Alert.dedup_hash == dedup_hash,
            Alert.status == AlertStatus.sent,
            Alert.sent_at >= cutoff,
        ).limit(1)
    )
    existing = result.scalar_one_or_none()

    if existing:
        logger.info(
            "dedup.suppressed",
            session_id=session_id,
            dedup_hash=dedup_hash[:12],
            original_sent_at=existing.sent_at.isoformat() if existing.sent_at else None,
            window_minutes=window,
        )
        return True

    return False


async def is_similar_duplicate(
    db: AsyncSession,
    org_id: str,
    theme: str,
    summary: str,
    window_minutes: Optional[int] = None,
) -> bool:
    """
    Verifica se um alerta com tema/resumo similar já foi enviado para a mesma
    org dentro da janela — mesmo que o hash exato seja diferente.
    """
    window = window_minutes or settings.DEDUP_WINDOW_MINUTES
    cutoff = datetime.utcnow() - timedelta(minutes=window)

    result = await db.execute(
        select(Alert)
        .options(selectinload(Alert.analysis))
        .where(
            Alert.org_id == org_id,
            Alert.status == AlertStatus.sent,
            Alert.sent_at >= cutoff,
        )
        .limit(50)
    )
    recent = result.scalars().all()

    for alert in recent:
        analysis: Optional[Analysis] = alert.analysis
        if not analysis:
            continue
        if texts_are_similar(theme, analysis.theme or ""):
            logger.info(
                "dedup.similar_theme_suppressed",
                org_id=org_id,
                theme=theme,
                existing_theme=analysis.theme,
            )
            return True
        if summary and analysis.summary and texts_are_similar(summary, analysis.summary):
            logger.info(
                "dedup.similar_summary_suppressed",
                org_id=org_id,
                theme=theme,
            )
            return True

    return False
