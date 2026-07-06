"""
Rotas do dashboard: áudio original e dados enriquecidos para a UI.
"""
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select, desc, update, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.core.models import (
    Alert, AlertStatus, Analysis, Transcription,
    MonitoringSession, SessionStatus, Program, Organization,
    RadioStation, StationSubscription, Report,
)
from src.api.schemas import AlertDetailOut, SessionDetailOut
from src.api.routes.auth import get_current_user
from src.core.models import User

router = APIRouter(tags=["Dashboard"])


def _iso_utc(dt) -> Optional[str]:
    """Serializa um datetime UTC (naive) como ISO com sufixo Z, para o
    navegador interpretar corretamente como UTC e converter para o fuso local."""
    if not dt:
        return None
    return dt.isoformat() + "Z"


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
    org_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Sessões recentes enriquecidas com programa, rádio e org."""
    q = (
        select(MonitoringSession)
        .options(selectinload(MonitoringSession.program).selectinload(Program.station))
        .order_by(desc(MonitoringSession.created_at))
        .limit(limit)
    )
    result = await db.execute(q)
    sessions = result.scalars().all()

    # Carrega orgs para enriquecer o nome
    orgs_result = await db.execute(select(Organization))
    orgs_map = {o.id: o for o in orgs_result.scalars().all()}

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
        s_org_id = station.org_id if station else None

        # Filtra por org se solicitado
        if org_id and s_org_id != org_id:
            continue

        org = orgs_map.get(s_org_id) if s_org_id else None
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
            org_id=s_org_id,
            org_name=org.name if org else None,
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


@router.get("/dashboard/client/{org_id}")
async def dashboard_client_bundle(
    org_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Pacote completo para a plataforma do cliente (org-aware): organização,
    estatísticas, alertas, relatórios e rádios assinadas por este cliente.
    Usa Alert.org_id / Analysis.org_id para dados por cliente (o cliente
    assina rádios de outro dono via StationSubscription).
    Requer autenticação; o usuário só acessa a própria organização.
    """
    if user.org_id != org_id:
        raise HTTPException(status_code=403, detail="Acesso negado a esta organização")

    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organização não encontrada")

    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    day_ago = now - timedelta(hours=24)

    # ── Rádios assinadas pelo cliente ────────────────────────────────────────
    subs_res = await db.execute(
        select(StationSubscription).where(
            StationSubscription.org_id == org_id,
            StationSubscription.is_active == True,
        )
    )
    subs = subs_res.scalars().all()
    station_ids = [s.station_id for s in subs]

    stations_map = {}
    programs_by_station: dict[str, list] = {}
    if station_ids:
        st_res = await db.execute(
            select(RadioStation).where(RadioStation.id.in_(station_ids))
        )
        stations_map = {s.id: s for s in st_res.scalars().all()}

        pg_res = await db.execute(
            select(Program).where(
                Program.station_id.in_(station_ids),
                Program.is_active == True,
            )
        )
        for pg in pg_res.scalars().all():
            programs_by_station.setdefault(pg.station_id, []).append(pg)

    # Sessões em andamento (rádios "no ar") entre as estações assinadas
    live_station_ids: set[str] = set()
    if station_ids:
        run_res = await db.execute(
            select(MonitoringSession)
            .options(selectinload(MonitoringSession.program))
            .where(MonitoringSession.status == SessionStatus.running)
        )
        for s in run_res.scalars().all():
            if s.program and s.program.station_id in station_ids:
                live_station_ids.add(s.program.station_id)

    def _sigla(name: str) -> str:
        import re
        nums = re.findall(r"\d+[.,]?\d*", name or "")
        if nums:
            return nums[0]
        words = [w for w in re.split(r"\s+", name or "") if w]
        return "".join(w[0] for w in words[:3]).upper() or "FM"

    dias_pt = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]
    day_key = {"monday": "seg", "tuesday": "ter", "wednesday": "qua",
               "thursday": "qui", "friday": "sex", "saturday": "sáb", "sunday": "dom"}

    radios = []
    for sid in station_ids:
        st = stations_map.get(sid)
        if not st:
            continue
        pgs = programs_by_station.get(sid, [])
        radios.append({
            "id": sid,
            "sigla": _sigla(st.name),
            "nome": st.name,
            "cidade": st.city,
            "no_ar": sid in live_station_ids,
            "programas": [
                {
                    "nome": p.name,
                    "horario": f"{p.start_time}–{p.end_time}",
                    "dias": [day_key.get(d, d[:3]) for d in (p.days_of_week or [])],
                }
                for p in sorted(pgs, key=lambda x: x.start_time or "")
            ],
        })

    # ── Alertas do cliente (Alert.org_id) ────────────────────────────────────
    al_res = await db.execute(
        select(Alert)
        .where(
            Alert.org_id == org_id,
            Alert.status.in_([AlertStatus.sent, AlertStatus.pending, AlertStatus.failed]),
        )
        .order_by(desc(Alert.created_at))
        .limit(50)
    )
    alerts_rows = al_res.scalars().all()

    # Mapa session→(programa,estação) para rotular os alertas
    sess_ids = list({a.session_id for a in alerts_rows})
    sess_info: dict[str, dict] = {}
    if sess_ids:
        se_res = await db.execute(
            select(MonitoringSession)
            .options(selectinload(MonitoringSession.program).selectinload(Program.station))
            .where(MonitoringSession.id.in_(sess_ids))
        )
        for s in se_res.scalars().all():
            prog = s.program
            stn = prog.station if prog else None
            sess_info[s.id] = {
                "programa": prog.name if prog else "—",
                "radio": stn.name if stn else "—",
            }

    alerts = []
    alerts_today = 0
    crit_today = 0
    alta_today = 0
    for a in alerts_rows:
        analysis = None
        transcription = None
        if a.analysis_id:
            an = await db.get(Analysis, a.analysis_id)
            analysis = an
            if an and an.transcription_id:
                transcription = await db.get(Transcription, an.transcription_id)
        has_audio = bool(
            transcription and transcription.audio_file_path
            and Path(transcription.audio_file_path).exists()
        )
        urg = analysis.urgency.value if analysis and analysis.urgency else "low"
        if a.created_at >= today_start:
            alerts_today += 1
            if urg == "critical":
                crit_today += 1
            elif urg == "high":
                alta_today += 1
        info = sess_info.get(a.session_id, {})
        alerts.append({
            "id": a.id,
            "urgency": urg,
            "content_type": analysis.content_type.value if analysis and analysis.content_type else None,
            "sentiment": analysis.sentiment.value if analysis and analysis.sentiment else None,
            "confidence": analysis.confidence_score if analysis else None,
            "theme": analysis.theme if analysis else None,
            "summary": analysis.summary if analysis else None,
            "excerpt": analysis.excerpt if analysis else None,
            "reason": analysis.reason if analysis else None,
            "suggested_action": analysis.suggested_action if analysis else None,
            "radio": info.get("radio", "—"),
            "programa": info.get("programa", "—"),
            # Horário da fala no ar (mesmo que vai no alerta do WhatsApp);
            # cai para o horário de criação do alerta se não houver transcrição.
            "created_at": _iso_utc(
                transcription.chunk_started_at if transcription and transcription.chunk_started_at
                else a.created_at
            ),
            "transcription_id": transcription.id if transcription else None,
            "has_audio": has_audio,
        })

    # ── Estatísticas (Analysis.org_id) ───────────────────────────────────────
    mencoes_24h = await db.scalar(
        select(func.count()).select_from(Analysis).where(
            Analysis.org_id == org_id,
            Analysis.is_relevant == True,
            Analysis.created_at >= day_ago,
        )
    ) or 0
    trechos_24h = await db.scalar(
        select(func.count()).select_from(Analysis).where(
            Analysis.org_id == org_id,
            Analysis.created_at >= day_ago,
        )
    ) or 0

    # ── Relatórios das sessões das rádios assinadas ──────────────────────────
    reports = []
    if station_ids:
        rep_res = await db.execute(
            select(Report, MonitoringSession, Program, RadioStation)
            .join(MonitoringSession, Report.session_id == MonitoringSession.id)
            .join(Program, MonitoringSession.program_id == Program.id)
            .join(RadioStation, Program.station_id == RadioStation.id)
            .where(RadioStation.id.in_(station_ids))
            .order_by(desc(Report.generated_at))
            .limit(30)
        )
        for rep, sess, prog, stn in rep_res.all():
            dur_min = 0
            if sess.started_at and sess.ended_at:
                dur_min = int((sess.ended_at - sess.started_at).total_seconds() / 60)
            reports.append({
                "id": rep.id,
                "session_id": rep.session_id,
                "programa": prog.name,
                "radio": stn.name,
                "sigla": _sigla(stn.name),
                "generated_at": _iso_utc(rep.generated_at),
                "duracao_min": dur_min,
                "total_mentions": rep.total_mentions,
                "alert_count": rep.alert_count,
                "high_urgency_count": rep.high_urgency_count,
                "overall_sentiment": rep.overall_sentiment.value if rep.overall_sentiment else None,
                "general_summary": rep.general_summary or rep.summary_text,
                "key_topics": rep.key_topics or [],
                "timeline": rep.timeline or [],
                "recommendations": rep.recommendations or [],
            })

    return {
        "org": {
            "id": org.id,
            "name": org.name,
            "city": org.city,
            "state": org.state,
        },
        "stats": {
            "alertas_hoje": alerts_today,
            "criticos_hoje": crit_today,
            "alta_hoje": alta_today,
            "mencoes_24h": mencoes_24h,
            "trechos_24h": trechos_24h,
            "radios_no_ar": len(live_station_ids),
            "radios_total": len(station_ids),
        },
        "radios": radios,
        "alertas": alerts,
        "relatorios": reports,
    }
