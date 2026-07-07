"""
CRUD de rádios cadastradas.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.core.models import RadioStation
from src.api.schemas import StationCreate, StationUpdate, StationOut, MessageOut
from src.scheduler.job_manager import job_manager
from src.api.routes.auth import require_admin

router = APIRouter(prefix="/stations", tags=["Rádios"])


@router.get("/", response_model=list[StationOut])
async def list_stations(org_id: str | None = None, db: AsyncSession = Depends(get_db)):
    q = select(RadioStation)
    if org_id:
        q = q.where(RadioStation.org_id == org_id)
    result = await db.execute(q.order_by(RadioStation.name))
    return result.scalars().all()


@router.post("/", response_model=StationOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
async def create_station(payload: StationCreate, db: AsyncSession = Depends(get_db)):
    station = RadioStation(**payload.model_dump())
    db.add(station)
    await db.commit()
    await db.refresh(station)
    return station


@router.get("/health/status")
async def stations_health(db: AsyncSession = Depends(get_db)):
    """
    Relatório operacional: última sessão de cada programa ativo, com status,
    blocos capturados, erro e avaliação — base para auditar rádios com problema.
    """
    from src.core.models import Program, MonitoringSession
    from sqlalchemy import desc

    result = await db.execute(
        select(RadioStation, Program)
        .join(Program, Program.station_id == RadioStation.id)
        .where(RadioStation.is_active == True, Program.is_active == True)
        .order_by(RadioStation.name, Program.start_time)
    )
    rows = result.all()

    out = []
    for station, program in rows:
        last = (await db.execute(
            select(MonitoringSession)
            .where(MonitoringSession.program_id == program.id)
            .order_by(desc(MonitoringSession.created_at))
            .limit(1)
        )).scalar_one_or_none()

        if last is None:
            assessment, action = "nunca_rodou", "aguardar primeira janela do programa"
        elif last.status.value == "completed" and (last.total_chunks or 0) > 0:
            assessment, action = "ok", "—"
        elif last.status.value == "running":
            assessment, action = "rodando", "—"
        elif (last.total_chunks or 0) == 0:
            assessment = "sem_captura"
            action = "stream fora do ar ou URL inválida — rode scripts/radio_health.py"
        else:
            assessment = "instável"
            action = "captura parcial — verificar reconexões e estabilidade do stream"

        out.append({
            "radio": station.name,
            "cidade": station.city,
            "programa": program.name,
            "janela": f"{program.start_time}–{program.end_time}",
            "stream_type": station.stream_type,
            "url": station.youtube_url or station.stream_url,
            "ultima_sessao": {
                "status": last.status.value if last else None,
                "inicio": last.started_at.isoformat() + "Z" if last and last.started_at else None,
                "blocos": last.total_chunks if last else None,
                "reconexoes": last.reconnect_count if last else None,
                "erro": last.error_message if last else None,
            },
            "avaliacao": assessment,
            "acao_recomendada": action,
        })
    return {"programas": out, "total": len(out)}


@router.get("/{station_id}", response_model=StationOut)
async def get_station(station_id: str, db: AsyncSession = Depends(get_db)):
    station = await db.get(RadioStation, station_id)
    if not station:
        raise HTTPException(status_code=404, detail="Rádio não encontrada")
    return station


@router.patch("/{station_id}", response_model=StationOut, dependencies=[Depends(require_admin)])
async def update_station(
    station_id: str,
    payload: StationUpdate,
    db: AsyncSession = Depends(get_db),
):
    station = await db.get(RadioStation, station_id)
    if not station:
        raise HTTPException(status_code=404, detail="Rádio não encontrada")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(station, field, value)

    await db.commit()
    await db.refresh(station)
    return station


@router.delete("/{station_id}", response_model=MessageOut, dependencies=[Depends(require_admin)])
async def delete_station(station_id: str, db: AsyncSession = Depends(get_db)):
    station = await db.get(RadioStation, station_id)
    if not station:
        raise HTTPException(status_code=404, detail="Rádio não encontrada")

    await db.delete(station)
    await db.commit()
    return MessageOut(message="Rádio removida com sucesso")
