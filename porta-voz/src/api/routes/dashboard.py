"""
Rotas do dashboard: áudio original e dados enriquecidos para a UI.
"""
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select, desc, update
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.core.models import (
    Alert, AlertStatus, Analysis, Transcription,
    MonitoringSession, SessionStatus, Program,
)
from src.api.schemas import AlertDetailOut, SessionDetailOut

router = APIRouter(tags=["Dashboard"])


@router.get("/audio/{transcription_id}", include_in_schema=False)
async def serve_audio(transcription_id: str, db: AsyncSession = Depends(get_db)):
    """Serve o arquivo WAV original de um trecho transcrito."""
    result = await db.execute(
        select(Transcription).where(Transcription.id == transcription_id)
    )
    trans = result.scalar_one_or_none()
    if not trans or not trans.audio_file_path:
        raise HTTPException(status_code=404, detail="Áudio não encontrado")

    audio_path = Path(trans.audio_file_path)
    if not audio_path.exists():
        raise HTTPException(status_code=404, detail="Arquivo de áudio não disponível")

    return FileResponse(
        path=str(audio_path),
        media_type="audio/wav",
        filename=f"porta_voz_{transcription_id[:8]}.wav",
    )


@router.get("/dashboard/sessions", response_model=List[SessionDetailOut])
async def dashboard_sessions(
    limit: int = 30,
    db: AsyncSession = Depends(get_db),
):
    """Sessões recentes enriquecidas com programa e rádio."""
    result = await db.execute(
        select(MonitoringSession)
        .options(
            selectinload(MonitoringSession.program).selectinload(Program.station)
        )
        .order_by(desc(MonitoringSession.created_at))
        .limit(limit)
    )
    sessions = result.scalars().all()

    # Corrige sessões presas como "running" há mais de 6 horas
    stale_cutoff = datetime.utcnow() - timedelta(hours=6)
    for s in sessions:
        if s.status and s.status.value == "running" and s.created_at < stale_cutoff:
            s.status = SessionStatus.completed
            if not s.ended_at:
                s.ended_at = s.created_at + timedelta(minutes=s.total_chunks // 2)
    await db.commit()

    out = []
    for s in sessions:
        program = s.program
        station = program.station if program else None
        out.append(SessionDetailOut(
            id=s.id,
            status=s.status.value if s.status else "unknown",
            started_at=s.started_at,
            ended_at=s.ended_at,
            total_chunks=s.total_chunks,
            relevant_chunks=s.relevant_chunks,
            total_alerts_sent=s.total_alerts_sent,
            created_at=s.created_at,
            program_name=program.name if program else None,
            station_name=station.name if station else None,
            station_city=station.city if station else None,
        ))
    return out


@router.get("/dashboard/alerts/{session_id}", response_model=List[AlertDetailOut])
async def dashboard_alerts(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Alertas de uma sessão enriquecidos com análise e transcrição."""
    result = await db.execute(
        select(Alert)
        .where(
            Alert.session_id == session_id,
            Alert.status != AlertStatus.suppressed,
        )
        .order_by(Alert.created_at)
    )
    alerts = result.scalars().all()

    out = []
    for alert in alerts:
        analysis: Optional[Analysis] = None
        transcription: Optional[Transcription] = None

        if alert.analysis_id:
            a_res = await db.execute(
                select(Analysis).where(Analysis.id == alert.analysis_id)
            )
            analysis = a_res.scalar_one_or_none()

            if analysis and analysis.transcription_id:
                t_res = await db.execute(
                    select(Transcription).where(Transcription.id == analysis.transcription_id)
                )
                transcription = t_res.scalar_one_or_none()

        has_audio = bool(
            transcription
            and transcription.audio_file_path
            and Path(transcription.audio_file_path).exists()
        )

        entities = []
        if analysis and analysis.raw_response and isinstance(analysis.raw_response, dict):
            entities = analysis.raw_response.get("entities_mentioned", [])

        out.append(AlertDetailOut(
            id=alert.id,
            status=alert.status.value if alert.status else "unknown",
            message_text=alert.message_text,
            sent_at=alert.sent_at,
            created_at=alert.created_at,
            theme=analysis.theme if analysis else None,
            sentiment=analysis.sentiment.value if analysis and analysis.sentiment else None,
            urgency=analysis.urgency.value if analysis and analysis.urgency else None,
            content_type=analysis.content_type.value if analysis and analysis.content_type else None,
            summary=analysis.summary if analysis else None,
            excerpt=analysis.excerpt if analysis else None,
            reason=analysis.reason if analysis else None,
            suggested_action=analysis.suggested_action if analysis else None,
            confidence_score=analysis.confidence_score if analysis else None,
            entities_mentioned=entities,
            transcription_id=transcription.id if transcription else None,
            chunk_started_at=transcription.chunk_started_at if transcription else None,
            raw_text=transcription.raw_text if transcription else None,
            has_audio=has_audio,
        ))
    return out
