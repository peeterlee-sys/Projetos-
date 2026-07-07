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
