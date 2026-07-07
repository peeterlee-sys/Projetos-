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


# Assinaturas clássicas de ALUCINAÇÃO do Whisper em música/vinheta/silêncio —
# frases que o modelo "inventa" quando não há fala real no áudio.
_HALLUCINATION_SIGNATURES = (
    "legendas pela comunidade",
    "amara.org",
    "legendado por",
    "transcrição por",
    "obrigado por assistir",
    "não se esqueça de se inscrever",
    "inscreva-se no canal",
)


def _looks_hallucinated(text: str) -> bool:
    """
    Detecta texto fantasma: assinaturas conhecidas ou a mesma frase curta
    repetida ocupando o bloco inteiro (padrão típico do Whisper em música).
    """
    t = text.strip().lower()
    if not t:
        return False
    if any(sig in t for sig in _HALLUCINATION_SIGNATURES):
        return True
    # Frase curta repetida ≥4x cobrindo praticamente o texto todo
    words = t.split()
    if len(words) >= 8:
        for size in (1, 2, 3, 4):
            if len(words) >= size * 4:
                first = words[:size]
                reps = sum(
                    1 for i in range(0, len(words) - size + 1, size)
                    if words[i:i + size] == first
                )
                if reps * size >= len(words) * 0.8:
                    return True
    return False


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

        if _looks_hallucinated(text):
            # Música/vinheta transcrita como texto fantasma: descarta antes que
            # vire keyword match (e análise paga / alerta falso).
            logger.info(
                "transcriber.hallucination_dropped",
                chunk_index=chunk_index,
                preview=text[:100],
            )
            return None

        logger.info(
            "transcriber.success",
            chunk_index=chunk_index,
            duration_ms=duration_ms,
            model=settings.WHISPER_MODEL,
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
