"""
Listagem e visualização de relatórios de sessão.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.core.models import Report
from src.api.schemas import ReportOut

router = APIRouter(prefix="/reports", tags=["Relatórios"])


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
