"""
Detecção de silêncio em chunks de áudio via ffmpeg volumedetect.
Evita gastar transcrição Whisper com silêncio, intervalos mudos e falhas de sinal.
"""
import asyncio
import re
from pathlib import Path
from typing import Optional

from src.core.config import settings
from src.core.logging_config import get_logger

logger = get_logger(__name__)

_MEAN_VOLUME_RE = re.compile(r"mean_volume:\s*(-?[\d.]+)\s*dB")


async def get_mean_volume_db(audio_path: Path) -> Optional[float]:
    """Retorna o volume médio (dB) do arquivo, ou None se a medição falhar."""
    cmd = [
        "ffmpeg", "-hide_banner", "-i", str(audio_path),
        "-af", "volumedetect", "-f", "null", "-",
    ]
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=30.0)
        match = _MEAN_VOLUME_RE.search(stderr.decode("utf-8", errors="replace"))
        if match:
            return float(match.group(1))
        return None
    except Exception as e:
        logger.warning("silence.volumedetect_failed", path=str(audio_path), error=str(e))
        return None


async def is_silent_chunk(audio_path: Path) -> bool:
    """
    True se o chunk deve ser tratado como silêncio (pular transcrição).
    Em caso de dúvida (medição falhou), NÃO pula — transcreve normalmente.
    """
    if not settings.SKIP_SILENT_CHUNKS:
        return False

    mean_db = await get_mean_volume_db(audio_path)
    if mean_db is None:
        return False

    silent = mean_db < settings.SILENCE_MEAN_DB_THRESHOLD
    if silent:
        logger.info("silence.chunk_skipped", path=audio_path.name, mean_db=mean_db)
    return silent
