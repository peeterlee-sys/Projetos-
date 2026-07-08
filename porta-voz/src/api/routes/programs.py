"""
CRUD de programas de rádio + controle de monitoramento.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.core.models import Program, RadioStation
from src.api.schemas import (
    ProgramCreate, ProgramUpdate, ProgramOut,
    MonitorStartRequest, MonitorStatusOut, MessageOut,
)
from src.scheduler.job_manager import job_manager
from src.api.routes.auth import require_admin

router = APIRouter(prefix="/programs", tags=["Programas"])


@router.get("/", response_model=list[ProgramOut])
async def list_programs(
    station_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(Program)
    if station_id:
        q = q.where(Program.station_id == station_id)
    result = await db.execute(q.order_by(Program.name))
    return result.scalars().all()


@router.post("/", response_model=ProgramOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
async def create_program(payload: ProgramCreate, db: AsyncSession = Depends(get_db)):
    station = await db.get(RadioStation, payload.station_id)
    if not station:
        raise HTTPException(status_code=404, detail="Rádio não encontrada")

    program = Program(**payload.model_dump())
    db.add(program)
    await db.commit()
    await db.refresh(program)

    # Agenda e, se já estiver no horário do programa, começa a capturar agora
    await job_manager.activate_program(program)

    return program


@router.get("/{program_id}", response_model=ProgramOut)
async def get_program(program_id: str, db: AsyncSession = Depends(get_db)):
    program = await db.get(Program, program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Programa não encontrado")
    return program


@router.patch("/{program_id}", response_model=ProgramOut, dependencies=[Depends(require_admin)])
async def update_program(
    program_id: str,
    payload: ProgramUpdate,
    db: AsyncSession = Depends(get_db),
):
    program = await db.get(Program, program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Programa não encontrado")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(program, field, value)

    await db.commit()
    await db.refresh(program)

    # Re-agenda com novos horários (e inicia agora se já estiver na janela)
    if program.is_active:
        await job_manager.activate_program(program)
    else:
        job_manager.unschedule_program(program_id)

    return program


@router.delete("/{program_id}", response_model=MessageOut, dependencies=[Depends(require_admin)])
async def delete_program(program_id: str, db: AsyncSession = Depends(get_db)):
    program = await db.get(Program, program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Programa não encontrado")

    job_manager.unschedule_program(program_id)
    await db.delete(program)
    await db.commit()
    return MessageOut(message="Programa removido com sucesso")


# ─── Controle de monitoramento ────────────────────────────────────────────────

@router.post("/{program_id}/monitor/start", response_model=MonitorStatusOut, dependencies=[Depends(require_admin)])
async def start_monitoring(program_id: str, db: AsyncSession = Depends(get_db)):
    program = await db.get(Program, program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Programa não encontrado")

    if job_manager.is_monitoring(program_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Monitoramento já está em andamento para este programa",
        )

    session_id = await job_manager.start_monitoring_now(program_id)
    return MonitorStatusOut(
        program_id=program_id,
        is_monitoring=True,
        session_id=session_id,
    )


@router.post("/{program_id}/monitor/stop", response_model=MonitorStatusOut, dependencies=[Depends(require_admin)])
async def stop_monitoring(program_id: str):
    if not job_manager.is_monitoring(program_id):
        raise HTTPException(status_code=404, detail="Nenhum monitoramento ativo para este programa")

    await job_manager.stop_monitoring_now(program_id)
    return MonitorStatusOut(program_id=program_id, is_monitoring=False)


@router.get("/{program_id}/monitor/status", response_model=MonitorStatusOut)
async def monitoring_status(program_id: str):
    return MonitorStatusOut(
        program_id=program_id,
        is_monitoring=job_manager.is_monitoring(program_id),
    )
