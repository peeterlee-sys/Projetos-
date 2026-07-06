"""
Listagem e visualização de relatórios de sessão.
"""
from datetime import datetime, date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.core.models import Report
from src.api.schemas import ReportOut
from src.reports.daily_clipping import generate_and_send_daily_clipping

router = APIRouter(prefix="/reports", tags=["Relatórios"])


@router.post("/clipping/{org_id}")
async def send_daily_clipping(
    org_id: str,
    day: Optional[str] = None,   # AAAA-MM-DD; padrão = hoje (BRT)
    send: bool = True,           # send=false só devolve a prévia, sem enviar
):
    """
    Gera a clipagem diária (todas as menções relevantes do dia) de uma organização
    e envia por WhatsApp. Use send=false para apenas pré-visualizar o texto.
    """
    target_date: Optional[date] = None
    if day:
        try:
            target_date = datetime.strptime(day, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Data inválida. Use AAAA-MM-DD.")

    result = await generate_and_send_daily_clipping(org_id, target_date=target_date, send=send)
    if result.get("error") == "org_not_found":
        raise HTTPException(status_code=404, detail="Organização não encontrada")
    return result


@router.get("/", response_model=list[ReportOut])
async def list_reports(
    limit: int = 20,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    q = select(Report).order_by(desc(Report.generated_at)).limit(limit).offset(offset)
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/session/{session_id}", response_model=ReportOut)
async def get_report_by_session(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Report).where(Report.session_id == session_id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Relatório não encontrado para esta sessão")
    return report


@router.get("/{report_id}", response_model=ReportOut)
async def get_report(report_id: str, db: AsyncSession = Depends(get_db)):
    report = await db.get(Report, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    return report
