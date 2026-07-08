#!/usr/bin/env python3
"""
Auditoria ativa das rádios cadastradas: sonda cada stream AGORA e cruza com o
histórico de sessões, classificando o problema e a ação recomendada.

Uso (no servidor, na raiz do projeto):
    python3 scripts/radio_health.py

Saída: tabela por rádio/programa com status da sonda, última captura e ação.
"""
import asyncio
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, desc

from src.core.database import AsyncSessionLocal
from src.core.models import RadioStation, Program, MonitoringSession


async def probe_stream(url: str, timeout: float = 12.0) -> tuple[str, str]:
    """Sonda uma URL de stream com ffprobe. Retorna (status, detalhe)."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffprobe", "-v", "error", "-show_entries", "format=format_name",
            "-of", "csv=p=0", url,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            proc.kill()
            return "TIMEOUT", f"sem resposta em {timeout:.0f}s"
        if proc.returncode == 0 and stdout.strip():
            return "OK", stdout.decode().strip()
        err = stderr.decode(errors="ignore").strip().splitlines()
        detail = err[-1][:90] if err else "erro desconhecido"
        low = detail.lower()
        if "404" in low or "not found" in low:
            return "URL_INVALIDA", detail
        if "name or service not known" in low or "failed to resolve" in low:
            return "DNS", detail
        if "connection refused" in low or "timed out" in low:
            return "FORA_DO_AR", detail
        return "ERRO", detail
    except FileNotFoundError:
        return "SEM_FFPROBE", "instale ffmpeg/ffprobe"
    except Exception as e:
        return "ERRO", str(e)[:90]


async def probe_youtube(url: str) -> tuple[str, str]:
    """Resolve um YouTube Live via o mesmo caminho usado na captura."""
    try:
        from src.capture.youtube import get_youtube_stream_url
        resolved = await get_youtube_stream_url(url)
        if resolved:
            return "OK", "live resolvido"
        return "YT_SEM_LIVE", "live fora do ar, cookies vencidos ou bloqueio"
    except Exception as e:
        return "ERRO", str(e)[:90]


ACTIONS = {
    "OK": "—",
    "URL_INVALIDA": "URL morta: obter novo endereço de stream e atualizar o cadastro",
    "DNS": "domínio não resolve: host do stream mudou/morreu — buscar nova URL",
    "FORA_DO_AR": "servidor recusa/atrasa: rádio possivelmente fora do ar agora — reconferir mais tarde",
    "TIMEOUT": "sem resposta: stream instável ou bloqueio de IP — reconferir; se persistir, nova URL",
    "YT_SEM_LIVE": "YouTube: conferir se a live está no ar e renovar youtube_cookies.txt",
    "ERRO": "erro não classificado: ver detalhe",
    "SEM_FFPROBE": "instalar ffmpeg no servidor",
}


async def main():
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(RadioStation, Program)
            .join(Program, Program.station_id == RadioStation.id)
            .where(RadioStation.is_active == True, Program.is_active == True)
            .order_by(RadioStation.name)
        )).all()

        print("=" * 100)
        print(f"  RADAR PÚBLICO — Auditoria de rádios · {datetime.now():%d/%m/%Y %H:%M}")
        print("=" * 100)

        probed: dict[str, tuple[str, str]] = {}
        for station, program in rows:
            # Mesma ordem da produção (resolve_stream_url): stream direto
            # primeiro; YouTube só quando não há stream_url.
            url = station.stream_url or station.youtube_url or ""
            if url not in probed:
                if station.stream_url:
                    probed[url] = await probe_stream(url)
                elif station.youtube_url:
                    probed[url] = await probe_youtube(url)
                else:
                    probed[url] = ("SEM_URL", "cadastro sem stream_url/youtube_url")

            status, detail = probed[url]

            last = (await db.execute(
                select(MonitoringSession)
                .where(MonitoringSession.program_id == program.id)
                .order_by(desc(MonitoringSession.created_at)).limit(1)
            )).scalar_one_or_none()
            if last:
                cap = (f"{last.status.value} · {last.total_chunks or 0} blocos · "
                       f"{last.started_at:%d/%m %H:%M}" if last.started_at else last.status.value)
                if last.error_message:
                    cap += f" · erro: {last.error_message[:50]}"
            else:
                cap = "nunca rodou"

            icon = "✅" if status == "OK" else "❌"
            print(f"\n{icon} {station.name}  ({station.city or '?'})")
            print(f"   Programa:       {program.name}  [{program.start_time}–{program.end_time}]")
            print(f"   Sonda agora:    {status} — {detail}")
            print(f"   Última captura: {cap}")
            print(f"   Ação:           {ACTIONS.get(status, '—')}")

        print("\n" + "=" * 100)


if __name__ == "__main__":
    asyncio.run(main())
