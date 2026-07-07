"""
Gate de áudio: decide se vale a pena PAGAR transcrição de um bloco.

Usa o volumedetect do ffmpeg (local, ~50ms, custo zero) para medir o volume
médio do bloco. Bloco praticamente mudo — transmissor fora do ar, dead air,
falha parcial de captura — é descartado antes de chamar a API de transcrição.

Nota honesta: isso NÃO detecta música (música tem volume). Música ainda é
transcrita; o filtro de alucinação do transcriber evita que o texto fantasma
dela vire keyword/alerta.
"""
import asyncio
import re
from pathlib import Path
from typing import Optional

from src.core.config import settings
from src.core.logging_config import get_logger

logger = get_logger(__name__)

_MEAN_RE = re.compile(r"mean_volume:\s*(-?[\d.]+)\s*dB")


async def mean_volume_db(audio_path: Path) -> Optional[float]:
    """Volume médio do arquivo em dB (None se o ffmpeg falhar)."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-hide_banner", "-i", str(audio_path),
            "-af", "volumedetect", "-f", "null", "-",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=20)
        match = _MEAN_RE.search(stderr.decode(errors="ignore"))
        return float(match.group(1)) if match else None
    except Exception as e:
        logger.warning("audio_gate.volumedetect_failed", path=str(audio_path), error=str(e))
        return None


async def should_transcribe(audio_path: Path, chunk_index: int = 0) -> bool:
    """
    True se o bloco deve ir para a transcrição paga.
    Em caso de dúvida (ffmpeg falhou), transcreve — perder fala é pior que
    pagar um bloco à toa.
    """
    if not settings.SKIP_SILENT_CHUNKS:
        return True

    volume = await mean_volume_db(audio_path)
    if volume is None:
        return True

    if volume < settings.SILENCE_MEAN_DB:
        logger.info(
            "audio_gate.skipped_silent",
            chunk_index=chunk_index,
            mean_volume_db=volume,
            threshold_db=settings.SILENCE_MEAN_DB,
        )
        return False
    return True
