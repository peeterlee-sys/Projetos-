"""
Listagem e visualização de alertas enviados.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.core.models import Alert, AlertStatus
from src.api.schemas import AlertOut

router = APIRouter(prefix="/alerts", tags=["Alertas"])


@router.get("/", response_model=list[AlertOut])
async def list_alerts(
    session_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    q = select(Alert)

    if session_id:
        q = q.where(Alert.session_id == session_id)
    if status:
        try:
            q = q.where(Alert.status == AlertStatus(status))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Status inválido: {status}")

    q = q.order_by(desc(Alert.created_at)).limit(limit).offset(offset)
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/{alert_id}", response_model=AlertOut)
async def get_alert(alert_id: str, db: AsyncSession = Depends(get_db)):
    alert = await db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alerta não encontrado")
    return alert
