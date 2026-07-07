"""
Relatório operacional das rádios monitoradas e download de clips de áudio.
"""
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.core.models import (
    RadioStation, Program, CaptureEvent, CaptureEventType, Transcription,
    Alert, Analysis,
)

router = APIRouter(tags=["Operacional"])

_STATUS_OK = "ok"
_STATUS_DEGRADED = "degraded"
_STATUS_DOWN = "down"
_STATUS_UNKNOWN = "unknown"

_RECOMMENDED_ACTIONS = {
    "dns_failure": "Verificar/atualizar a URL do stream (DNS não resolve)",
    "invalid_url": "Cadastrar nova URL de stream",
    "timeout": "Monitorar — falha temporária, reconexão automática",
    "http_error": "Confirmar se o stream mudou de endereço",
    "format_error": "Verificar codec/formato do stream",
    "stream_offline": "Confirmar com a emissora se está no ar",
    "system_error": "Ação humana: verificar logs/infraestrutura",
    "unknown": "Ação humana: investigar logs",
}


@router.get("/health/stations")
async def stations_operational_report(db: AsyncSession = Depends(get_db)):
    """
    Status operacional por rádio: última captura, último sucesso, última falha,
    motivo classificado, tentativas e ação recomendada.
    """
    stations = (await db.execute(select(RadioStation))).scalars().all()
    report = []

    for station in stations:
        programs = (await db.execute(
            select(Program).where(Program.station_id == station.id)
        )).scalars().all()

        last_event = (await db.execute(
            select(CaptureEvent)
            .where(CaptureEvent.station_id == station.id)
            .order_by(desc(CaptureEvent.created_at))
            .limit(1)
        )).scalar_one_or_none()

        last_success = (await db.execute(
            select(CaptureEvent)
            .where(
                CaptureEvent.station_id == station.id,
                CaptureEvent.event_type == CaptureEventType.capture_success,
            )
            .order_by(desc(CaptureEvent.created_at))
            .limit(1)
        )).scalar_one_or_none()

        last_failure = (await db.execute(
            select(CaptureEvent)
            .where(
                CaptureEvent.station_id == station.id,
                CaptureEvent.event_type.in_([
                    CaptureEventType.capture_failed,
                    CaptureEventType.reconnect,
                    CaptureEventType.resolve_failed,
                ]),
            )
            .order_by(desc(CaptureEvent.created_at))
            .limit(1)
        )).scalar_one_or_none()

        failure_count_24h = (await db.execute(
            select(func.count(CaptureEvent.id)).where(
                CaptureEvent.station_id == station.id,
                CaptureEvent.event_type.in_([
                    CaptureEventType.capture_failed,
                    CaptureEventType.reconnect,
                    CaptureEventType.resolve_failed,
                ]),
                CaptureEvent.created_at >= func.datetime("now", "-1 day"),
            )
        )).scalar() or 0

        # Status derivado: falha mais recente que o último sucesso → problema
        if not last_event:
            status = _STATUS_UNKNOWN
        elif last_failure and (
            not last_success or last_failure.created_at > last_success.created_at
        ):
            error_class = last_failure.error_class or "unknown"
            status = _STATUS_DOWN if error_class in (
                "dns_failure", "invalid_url", "stream_offline", "format_error"
            ) else _STATUS_DEGRADED
        else:
            status = _STATUS_OK

        error_class = (last_failure.error_class if last_failure else None) or None
        report.append({
            "station": station.name,
            "city": station.city,
            "is_active": station.is_active,
            "stream_url": station.stream_url,
            "programs": [
                {
                    "name": p.name,
                    "days": p.days_of_week,
                    "schedule": f"{p.start_time}-{p.end_time}",
                    "is_active": p.is_active,
                }
                for p in programs
            ],
            "status": status,
            "last_event": {
                "type": last_event.event_type.value,
                "at": last_event.created_at.isoformat(),
            } if last_event else None,
            "last_success_at": last_success.created_at.isoformat() if last_success else None,
            "last_failure": {
                "at": last_failure.created_at.isoformat(),
                "error_class": error_class,
                "message": last_failure.message,
                "attempt": last_failure.attempt,
            } if last_failure else None,
            "failures_24h": failure_count_24h,
            "recommended_action": _RECOMMENDED_ACTIONS.get(error_class, "—") if status != _STATUS_OK else "—",
        })

    return {"generated_at": datetime.utcnow().isoformat(), "stations": report}


@router.get("/health/costs")
async def costs_report(db: AsyncSession = Depends(get_db)):
    """Custo estimado agregado por organização (análises + alertas)."""
    analysis_costs = (await db.execute(
        select(
            Analysis.org_id,
            func.count(Analysis.id),
            func.coalesce(func.sum(Analysis.estimated_cost_usd), 0.0),
        ).group_by(Analysis.org_id)
    )).all()

    alert_costs = (await db.execute(
        select(
            Alert.org_id,
            Alert.status,
            func.count(Alert.id),
            func.coalesce(func.sum(Alert.estimated_cost_usd), 0.0),
        ).group_by(Alert.org_id, Alert.status)
    )).all()

    return {
        "analyses_by_org": [
            {"org_id": org, "count": count, "estimated_cost_usd": round(cost, 4)}
            for org, count, cost in analysis_costs
        ],
        "alerts_by_org_status": [
            {"org_id": org, "status": status.value if status else None,
             "count": count, "estimated_cost_usd": round(cost, 4)}
            for org, status, count, cost in alert_costs
        ],
    }


@router.get("/clips/{transcription_id}")
async def download_clip(transcription_id: str, db: AsyncSession = Depends(get_db)):
    """Download/streaming do áudio completo vinculado a uma transcrição."""
    transcription = await db.get(Transcription, transcription_id)
    if not transcription or not transcription.clip_file_path:
        raise HTTPException(status_code=404, detail="Áudio não encontrado")
    path = Path(transcription.clip_file_path)
    if not path.exists():
        raise HTTPException(status_code=410, detail="Áudio expirado ou removido")
    return FileResponse(path, media_type="audio/mpeg", filename=path.name)
