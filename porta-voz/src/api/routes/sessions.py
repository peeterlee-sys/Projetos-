"""
Listagem e visualização de sessões de monitoramento.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.core.models import MonitoringSession, SessionStatus
from src.api.schemas import SessionOut

router = APIRouter(prefix="/sessions", tags=["Sessões"])


@router.get("/", response_model=list[SessionOut])
async def list_sessions(
    program_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    q = select(MonitoringSession)

    if program_id:
        q = q.where(MonitoringSession.program_id == program_id)
    if status:
        try:
            q = q.where(MonitoringSession.status == SessionStatus(status))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Status inválido: {status}")

    q = q.order_by(desc(MonitoringSession.created_at)).limit(limit).offset(offset)
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/{session_id}", response_model=SessionOut)
async def get_session(session_id: str, db: AsyncSession = Depends(get_db)):
    session = await db.get(MonitoringSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Sessão não encontrada")
    return session
