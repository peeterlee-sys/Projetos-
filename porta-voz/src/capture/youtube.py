"""
Extrai URL de stream de YouTube Live usando yt-dlp.
"""
import asyncio
import json
import os
from pathlib import Path
from typing import Optional

from src.core.logging_config import get_logger

logger = get_logger(__name__)


def _cookies_args() -> list[str]:
    """
    Retorna args de cookies se um arquivo de cookies do YouTube estiver
    configurado (env YOUTUBE_COOKIES_FILE). Necessário para contornar o
    'Sign in to confirm you're not a bot' em IPs de datacenter.
    """
    cookies_file = os.environ.get("YOUTUBE_COOKIES_FILE", "").strip()
    if cookies_file and Path(cookies_file).exists():
        return ["--cookies", cookies_file]
    return []


async def get_youtube_stream_url(youtube_url: str, quality: str = "bestaudio") -> Optional[str]:
    """
    Usa yt-dlp para obter a URL real do stream HLS/MP4 de um YouTube Live.
    Retorna None se falhar.
    """
    cmd = [
        "yt-dlp",
        "--no-playlist",
        "--format", quality,
        "--get-url",
        "--no-warnings",
        *_cookies_args(),
        youtube_url,
    ]

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30.0)

        if proc.returncode == 0 and stdout:
            url = stdout.decode("utf-8").strip().split("\n")[0]
            logger.info("youtube.stream_url_extracted", url=url[:80])
            return url
        else:
            err = stderr.decode("utf-8", errors="replace")[:300]
            logger.error("youtube.extract_failed", error=err, youtube_url=youtube_url)
            return None

    except asyncio.TimeoutError:
        logger.error("youtube.timeout", youtube_url=youtube_url)
        return None
    except Exception as e:
        logger.error("youtube.error", error=str(e), youtube_url=youtube_url)
        return None


async def resolve_stream_url(station_stream_url: Optional[str], station_youtube_url: Optional[str]) -> Optional[str]:
    """
    Resolve a URL final do stream: prefere stream_url direto, tenta YouTube como fallback.
    """
    if station_stream_url:
        return station_stream_url

    if station_youtube_url:
        logger.info("youtube.resolving", url=station_youtube_url)
        return await get_youtube_stream_url(station_youtube_url)

    return None
