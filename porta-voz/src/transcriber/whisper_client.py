"""
Transcrição de áudio usando OpenAI Whisper API.
"""
import time
from pathlib import Path
from typing import Optional
from dataclasses import dataclass

from openai import AsyncOpenAI

from src.core.config import settings
from src.core.logging_config import get_logger

logger = get_logger(__name__)

_client: Optional[AsyncOpenAI] = None


def get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    return _client


@dataclass
class TranscriptionResult:
    text: str
    duration_ms: int
    language: str = "pt"
    chunk_index: int = 0


async def transcribe_audio(
    audio_path: Path,
    chunk_index: int = 0,
    prompt_hint: Optional[str] = None,
) -> Optional[TranscriptionResult]:
    """
    Transcreve um arquivo WAV usando OpenAI Whisper API.

    Args:
        audio_path: Caminho do arquivo de áudio (WAV, MP3, etc.)
        chunk_index: Índice do chunk para logging
        prompt_hint: Prompt para melhorar a transcrição de termos específicos

    Returns:
        TranscriptionResult ou None se falhar
    """
    if not audio_path.exists():
        logger.warning("transcriber.file_not_found", path=str(audio_path))
        return None

    file_size = audio_path.stat().st_size
    if file_size < 1000:  # arquivo muito pequeno = provavelmente vazio
        logger.debug("transcriber.file_too_small", path=str(audio_path), size=file_size)
        return None

    prompt = prompt_hint or settings.WHISPER_PROMPT
    start = time.monotonic()

    try:
        client = get_client()

        with open(audio_path, "rb") as f:
            response = await client.audio.transcriptions.create(
                model=settings.WHISPER_MODEL,
                file=f,
                language=settings.WHISPER_LANGUAGE,
                prompt=prompt,
                response_format="text",
            )

        duration_ms = int((time.monotonic() - start) * 1000)
        text = str(response).strip()

        logger.info(
            "transcriber.success",
            chunk_index=chunk_index,
            duration_ms=duration_ms,
            text_length=len(text),
            preview=text[:100],
        )

        return TranscriptionResult(
            text=text,
            duration_ms=duration_ms,
            chunk_index=chunk_index,
        )

    except Exception as e:
        logger.error(
            "transcriber.error",
            chunk_index=chunk_index,
            error=str(e),
            path=str(audio_path),
        )
        return None
