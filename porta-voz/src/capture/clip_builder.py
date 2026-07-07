"""
Constrói o clip de áudio completo de uma ocorrência.

O problema original: o WhatsApp recebia só o chunk de 30s onde a keyword
apareceu, muitas vezes cortado no meio da frase. Aqui o clip é montado
concatenando os chunks vizinhos (contexto antes e depois da menção), com
início e fim coerentes, e convertido para MP3.

Os chunks são segmentos WAV contíguos gerados pelo ffmpeg (chunk_00000.wav,
chunk_00001.wav, ...), então a concatenação reconstrói o áudio contínuo.
"""
import asyncio
import re
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

from src.core.config import settings
from src.core.logging_config import get_logger

logger = get_logger(__name__)

_CHUNK_INDEX_RE = re.compile(r"chunk_(\d+)\.wav$")


def chunk_index_from_path(path: Path) -> Optional[int]:
    match = _CHUNK_INDEX_RE.search(path.name)
    return int(match.group(1)) if match else None


def select_clip_chunk_range(
    center_index: int,
    available_indices: List[int],
    pre_chunks: Optional[int] = None,
    post_chunks: Optional[int] = None,
) -> List[int]:
    """
    Seleciona os índices de chunk que compõem o clip: [center - pre, center + post],
    limitado aos chunks realmente disponíveis e contíguos ao centro.
    Função pura — testável sem ffmpeg.
    """
    pre = pre_chunks if pre_chunks is not None else settings.CLIP_PRE_CONTEXT_CHUNKS
    post = post_chunks if post_chunks is not None else settings.CLIP_POST_CONTEXT_CHUNKS

    available = set(available_indices)
    if center_index not in available:
        return []

    selected = [center_index]
    # expande para trás enquanto contíguo
    for i in range(center_index - 1, center_index - pre - 1, -1):
        if i in available:
            selected.insert(0, i)
        else:
            break
    # expande para frente enquanto contíguo
    for i in range(center_index + 1, center_index + post + 1):
        if i in available:
            selected.append(i)
        else:
            break
    return selected


async def wait_for_post_context(
    chunk_dir: Path,
    center_index: int,
    post_chunks: Optional[int] = None,
    timeout_seconds: Optional[float] = None,
) -> None:
    """
    Aguarda os chunks posteriores à menção serem gravados, para o clip não
    terminar antes da conclusão do assunto. Timeout limita a espera quando o
    programa acaba logo depois da menção.
    """
    post = post_chunks if post_chunks is not None else settings.CLIP_POST_CONTEXT_CHUNKS
    if post <= 0:
        return
    timeout = timeout_seconds or ((post + 1) * settings.CHUNK_DURATION_SECONDS + 15)
    target = chunk_dir / f"chunk_{center_index + post:05d}.wav"
    # o segmento N está completo quando o N+1 existe
    sentinel = chunk_dir / f"chunk_{center_index + post + 1:05d}.wav"

    waited = 0.0
    interval = 2.0
    while waited < timeout:
        if sentinel.exists() or (target.exists() and waited >= timeout / 2):
            return
        await asyncio.sleep(interval)
        waited += interval


@dataclass
class ClipResult:
    file_path: Path
    size_bytes: int
    duration_seconds: int
    chunk_indices: List[int]
    truncated: bool  # True se foi cortado por limite técnico de tamanho


async def build_clip(
    chunk_dir: Path,
    center_index: int,
    session_id: str,
    output_dir: Optional[Path] = None,
) -> Optional[ClipResult]:
    """
    Monta o clip MP3 completo em torno do chunk `center_index`.
    Retorna None se nem o chunk central existir.
    """
    output_dir = output_dir or (settings.CLIPS_DIR / session_id)
    output_dir.mkdir(parents=True, exist_ok=True)

    available = sorted(
        idx for idx in (chunk_index_from_path(p) for p in chunk_dir.glob("chunk_*.wav"))
        if idx is not None
    )
    indices = select_clip_chunk_range(center_index, available)
    if not indices:
        logger.warning("clip.center_chunk_missing", chunk_dir=str(chunk_dir), center=center_index)
        return None

    concat_list = output_dir / f"concat_{center_index:05d}.txt"
    files = [chunk_dir / f"chunk_{i:05d}.wav" for i in indices]
    concat_list.write_text("".join(f"file '{f.resolve()}'\n" for f in files), encoding="utf-8")

    out_path = output_dir / f"clip_{center_index:05d}.mp3"
    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-f", "concat", "-safe", "0",
        "-i", str(concat_list),
        "-c:a", "libmp3lame", "-b:a", "64k", "-ac", "1",
        str(out_path),
    ]

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=120.0)
        if proc.returncode != 0:
            logger.error(
                "clip.ffmpeg_failed",
                error=stderr.decode("utf-8", errors="replace")[:300],
            )
            return None
    except Exception as e:
        logger.error("clip.build_error", error=str(e))
        return None
    finally:
        try:
            concat_list.unlink()
        except OSError:
            pass

    size = out_path.stat().st_size
    duration = len(indices) * settings.CHUNK_DURATION_SECONDS
    truncated = False

    # Limite técnico do WhatsApp — se estourar, envia o maior trecho possível
    # e registra a limitação (o link para o áudio completo continua íntegro).
    max_bytes = int(settings.MAX_AUDIO_MB * 1024 * 1024)
    if size > max_bytes:
        truncated = True
        logger.warning(
            "clip.exceeds_whatsapp_limit",
            size_mb=round(size / 1024 / 1024, 1),
            limit_mb=settings.MAX_AUDIO_MB,
        )

    logger.info(
        "clip.built",
        path=str(out_path),
        chunks=indices,
        duration_s=duration,
        size_kb=size // 1024,
    )

    return ClipResult(
        file_path=out_path,
        size_bytes=size,
        duration_seconds=duration,
        chunk_indices=indices,
        truncated=truncated,
    )
