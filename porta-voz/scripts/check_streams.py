"""
Auditoria das rádios cadastradas: testa cada stream_url com ffprobe e
classifica as falhas (DNS, timeout, URL inválida, formato, fora do ar).

Uso: python3 -m scripts.check_streams          (a partir da raiz do projeto)
     python3 scripts/check_streams.py
Saída: tabela no terminal + JSON em stream_report.json
"""
import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from src.core.database import AsyncSessionLocal  # noqa: E402
from src.core.models import RadioStation, Program  # noqa: E402
from src.health.failure_classifier import classify_failure  # noqa: E402

PROBE_TIMEOUT = 20.0


async def probe_stream(url: str) -> dict:
    """Testa um stream com ffprobe. Retorna {ok, error_class, detail}."""
    if not url:
        return {"ok": False, "error_class": "invalid_url", "detail": "URL vazia"}

    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=format_name,bit_rate",
        "-of", "json",
        "-rw_timeout", "15000000",  # 15s em microssegundos
        url,
    ]
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=PROBE_TIMEOUT)
        if proc.returncode == 0:
            info = json.loads(stdout.decode() or "{}").get("format", {})
            return {
                "ok": True,
                "error_class": None,
                "detail": f"format={info.get('format_name')} bitrate={info.get('bit_rate')}",
            }
        error_text = stderr.decode("utf-8", errors="replace").strip()
        classification = classify_failure(error_text)
        return {
            "ok": False,
            "error_class": classification.error_class,
            "detail": error_text[:200],
        }
    except asyncio.TimeoutError:
        return {"ok": False, "error_class": "timeout", "detail": f"Sem resposta em {PROBE_TIMEOUT}s"}
    except FileNotFoundError:
        return {"ok": False, "error_class": "system_error", "detail": "ffprobe não instalado"}
    except Exception as e:
        classification = classify_failure(str(e))
        return {"ok": False, "error_class": classification.error_class, "detail": str(e)[:200]}


async def main() -> None:
    async with AsyncSessionLocal() as db:
        stations = (await db.execute(select(RadioStation))).scalars().all()
        rows = []
        for station in stations:
            programs = (await db.execute(
                select(Program).where(Program.station_id == station.id)
            )).scalars().all()
            print(f"Testando {station.name} ({station.city or '?'})...", flush=True)
            result = await probe_stream(station.stream_url)
            rows.append({
                "station": station.name,
                "city": station.city,
                "is_active": station.is_active,
                "stream_url": station.stream_url,
                "programs": [f"{p.name} {p.start_time}-{p.end_time}" for p in programs],
                **result,
            })

    print("\n" + "=" * 90)
    print(f"{'RÁDIO':<28} {'CIDADE':<20} {'STATUS':<10} {'CLASSE':<15} DETALHE")
    print("=" * 90)
    for row in rows:
        status = "OK" if row["ok"] else "FALHA"
        print(
            f"{row['station'][:27]:<28} {(row['city'] or '?')[:19]:<20} "
            f"{status:<10} {(row['error_class'] or '-'):<15} {row['detail'][:40]}"
        )

    report = {"generated_at": datetime.utcnow().isoformat(), "stations": rows}
    out = Path("stream_report.json")
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nRelatório completo salvo em {out.resolve()}")


if __name__ == "__main__":
    asyncio.run(main())
