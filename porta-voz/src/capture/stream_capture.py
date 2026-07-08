"""
Captura de áudio de streams de rádio usando ffmpeg.
Gera chunks WAV de duração fixa para processamento.
"""
import asyncio
import subprocess
import shutil
from pathlib import Path
from datetime import datetime
from typing import AsyncIterator, Optional, Callable, Awaitable
from dataclasses import dataclass

from src.core.config import settings
from src.core.logging_config import get_logger

logger = get_logger(__name__)


@dataclass
class AudioChunk:
    index: int
    file_path: Path
    started_at: datetime
    duration_seconds: int
    session_id: str


class StreamCapture:
    """
    Captura um stream de rádio e gera chunks de áudio WAV.

    Usa ffmpeg com saída segmentada: a cada CHUNK_DURATION_SECONDS segundos
    um novo arquivo é gerado. Suporta reconexão automática.
    """

    def __init__(
        self,
        stream_url: str,
        session_id: str,
        chunk_duration: int = None,
        output_dir: Optional[Path] = None,
        on_chunk: Optional[Callable[[AudioChunk], None]] = None,
        url_resolver: Optional[Callable[[], Awaitable[Optional[str]]]] = None,
        ytdlp_cmd: Optional[list[str]] = None,
    ):
        self.stream_url = stream_url
        self.session_id = session_id
        self.chunk_duration = chunk_duration or settings.CHUNK_DURATION_SECONDS
        self.output_dir = output_dir or (settings.AUDIO_CHUNKS_DIR / session_id)
        self.on_chunk = on_chunk
        # Callback opcional que retorna uma URL fresca antes de cada (re)start
        # do ffmpeg. Para stream direto, retorna a mesma URL (sem efeito).
        self.url_resolver = url_resolver
        # Se definido, usa o modo YouTube: um processo yt-dlp de longa duração
        # baixa o stream e alimenta o ffmpeg por um pipe (evita HTTP 429).
        self.ytdlp_cmd = ytdlp_cmd
        self._process: Optional[asyncio.subprocess.Process] = None
        self._ytdlp_process: Optional[asyncio.subprocess.Process] = None
        self._running = False
        self._chunk_index = 0
        self._reconnect_count = 0

    def _check_ffmpeg(self) -> bool:
        return shutil.which("ffmpeg") is not None

    def _build_ffmpeg_cmd(self) -> list[str]:
        pattern = str(self.output_dir / "chunk_%05d.wav")
        return [
            "ffmpeg",
            "-loglevel", "warning",
            # Reconexão automática para streams HTTP
            "-reconnect", "1",
            "-reconnect_at_eof", "1",
            "-reconnect_streamed", "1",
            "-reconnect_delay_max", "5",
            # Streams Icecast/MP3 com timestamps quebrados fazem o segmentador
            # cortar cedo (blocos de ~12s em vez do configurado). Regenera os
            # timestamps a partir da duração dos frames.
            "-fflags", "+genpts+igndts",
            "-i", self.stream_url,
            # Saída segmentada
            "-f", "segment",
            "-segment_time", str(self.chunk_duration),
            "-reset_timestamps", "1",
            "-avoid_negative_ts", "make_zero",
            # Áudio otimizado para Whisper: 16kHz, mono, PCM
            "-ar", "16000",
            "-ac", "1",
            "-c:a", "pcm_s16le",
            # Não sobrescrever arquivos
            "-n",
            pattern,
        ]

    async def start(self) -> None:
        if not self._check_ffmpeg():
            raise RuntimeError("ffmpeg não encontrado. Instale com: apt install ffmpeg")

        self.output_dir.mkdir(parents=True, exist_ok=True)
        self._running = True

        logger.info(
            "stream_capture.started",
            session_id=self.session_id,
            stream_url=self.stream_url,
            chunk_duration=self.chunk_duration,
        )

        while self._running and self._reconnect_count <= settings.MAX_RECONNECT_ATTEMPTS:
            try:
                await self._run_ffmpeg()
            except asyncio.CancelledError:
                break
            except Exception as e:
                self._reconnect_count += 1
                logger.warning(
                    "stream_capture.reconnecting",
                    session_id=self.session_id,
                    attempt=self._reconnect_count,
                    error=str(e),
                )
                if self._reconnect_count > settings.MAX_RECONNECT_ATTEMPTS:
                    logger.error("stream_capture.max_reconnects_reached", session_id=self.session_id)
                    break
                await asyncio.sleep(settings.STREAM_RECONNECT_DELAY_SECONDS)

    async def _run_ffmpeg(self) -> None:
        if self.ytdlp_cmd is not None:
            await self._run_ytdlp_pipe()
            return

        # Reresolve a URL antes de (re)iniciar (modo stream direto).
        if self.url_resolver is not None:
            try:
                fresh_url = await self.url_resolver()
                if fresh_url:
                    self.stream_url = fresh_url
            except Exception as e:
                logger.warning("stream_capture.url_refresh_failed", error=str(e))

        cmd = self._build_ffmpeg_cmd()
        logger.debug("ffmpeg.starting", cmd=" ".join(cmd))

        self._process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        # Watch for new chunk files while ffmpeg runs
        watcher_task = asyncio.create_task(self._watch_chunks())

        stdout, stderr = await self._process.communicate()

        watcher_task.cancel()
        try:
            await watcher_task
        except asyncio.CancelledError:
            pass

        if self._process.returncode not in (0, None, -15):
            err = stderr.decode("utf-8", errors="replace") if stderr else "unknown"
            raise RuntimeError(f"ffmpeg exited with code {self._process.returncode}: {err[:500]}")

    async def _run_ytdlp_pipe(self) -> None:
        """
        Modo YouTube: yt-dlp baixa o stream ao vivo e escreve em stdout;
        o ffmpeg lê desse pipe e segmenta em chunks WAV. Um único yt-dlp de
        longa duração mantém uma só conexão com o YouTube (sem 429).
        """
        ffmpeg_cmd = [
            "ffmpeg",
            "-loglevel", "warning",
            "-i", "pipe:0",
            "-f", "segment",
            "-segment_time", str(self.chunk_duration),
            "-reset_timestamps", "1",
            "-ar", "16000",
            "-ac", "1",
            "-c:a", "pcm_s16le",
            "-n",
            str(self.output_dir / "chunk_%05d.wav"),
        ]
        logger.debug("ytdlp_pipe.starting", cmd=" ".join(self.ytdlp_cmd))

        self._ytdlp_process = await asyncio.create_subprocess_exec(
            *self.ytdlp_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        self._process = await asyncio.create_subprocess_exec(
            *ffmpeg_cmd,
            stdin=self._ytdlp_process.stdout,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        watcher_task = asyncio.create_task(self._watch_chunks())

        _, ff_stderr = await self._process.communicate()

        # Encerra o yt-dlp junto com o ffmpeg
        if self._ytdlp_process and self._ytdlp_process.returncode is None:
            try:
                self._ytdlp_process.terminate()
                await asyncio.wait_for(self._ytdlp_process.wait(), timeout=5.0)
            except (asyncio.TimeoutError, ProcessLookupError):
                try:
                    self._ytdlp_process.kill()
                except ProcessLookupError:
                    pass
        yt_stderr = b""
        if self._ytdlp_process and self._ytdlp_process.stderr:
            try:
                yt_stderr = await self._ytdlp_process.stderr.read()
            except Exception:
                pass

        watcher_task.cancel()
        try:
            await watcher_task
        except asyncio.CancelledError:
            pass

        if self._process.returncode not in (0, None, -15):
            ff_err = ff_stderr.decode("utf-8", errors="replace") if ff_stderr else ""
            yt_err = yt_stderr.decode("utf-8", errors="replace") if yt_stderr else ""
            raise RuntimeError(
                f"ytdlp/ffmpeg pipe exited (ffmpeg={self._process.returncode}): "
                f"{(yt_err or ff_err)[:500]}"
            )

    async def _watch_chunks(self) -> None:
        """Monitora o diretório de saída e entrega chunks conforme são completados."""
        seen: set[str] = set()
        check_interval = 1.0  # segundos

        while self._running:
            await asyncio.sleep(check_interval)
            try:
                files = sorted(self.output_dir.glob("chunk_*.wav"))
                # Um arquivo só está completo quando o PRÓXIMO existe
                complete_files = files[:-1] if len(files) > 1 else []

                for f in complete_files:
                    if f.name not in seen:
                        seen.add(f.name)
                        # Captura saudável: zera o contador de reconexões para
                        # que falhas esparsas ao longo de um programa longo não
                        # acumulem até o limite e matem a sessão.
                        self._reconnect_count = 0
                        chunk = AudioChunk(
                            index=self._chunk_index,
                            file_path=f,
                            started_at=datetime.utcnow(),
                            duration_seconds=self.chunk_duration,
                            session_id=self.session_id,
                        )
                        self._chunk_index += 1
                        logger.debug(
                            "chunk.ready",
                            session_id=self.session_id,
                            chunk_index=chunk.index,
                            file=f.name,
                        )
                        if self.on_chunk:
                            try:
                                if asyncio.iscoroutinefunction(self.on_chunk):
                                    await self.on_chunk(chunk)
                                else:
                                    self.on_chunk(chunk)
                            except Exception as e:
                                logger.error("chunk.callback_error", error=str(e))
            except Exception as e:
                logger.warning("chunk_watcher.error", error=str(e))

    async def stop(self) -> None:
        self._running = False
        for proc in (self._process, self._ytdlp_process):
            if proc and proc.returncode is None:
                try:
                    proc.terminate()
                    await asyncio.wait_for(proc.wait(), timeout=5.0)
                except asyncio.TimeoutError:
                    try:
                        proc.kill()
                    except ProcessLookupError:
                        pass
                except ProcessLookupError:
                    pass
        logger.info("stream_capture.stopped", session_id=self.session_id)

    def cleanup_chunks(self) -> None:
        """Remove arquivos temporários do diretório de chunks."""
        if self.output_dir.exists():
            for f in self.output_dir.glob("chunk_*.wav"):
                try:
                    f.unlink()
                except Exception:
                    pass
