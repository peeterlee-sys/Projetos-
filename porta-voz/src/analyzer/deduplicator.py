"""
Deduplicação de alertas: evita notificações repetidas do mesmo tema
dentro de uma janela de tempo configurável.
"""
import hashlib
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.models import Alert, AlertStatus
from src.core.config import settings
from src.core.logging_config import get_logger

logger = get_logger(__name__)


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
