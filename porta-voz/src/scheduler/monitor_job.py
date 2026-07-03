"""
Orquestrador principal de monitoramento.
Coordena captura → transcrição → filtro → análise → alerta para um programa de rádio.
Suporta múltiplos clientes monitorando a mesma rádio simultaneamente.
"""
import asyncio
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import pytz

from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import settings
from src.core.database import AsyncSessionLocal
from src.core.models import (
    MonitoringSession, Program, RadioStation, Transcription,
    Analysis, Alert, AlertStatus, SessionStatus, Sentiment,
    Urgency, ContentType, AlertRecipient, StationSubscription, Organization,
)
from src.capture.stream_capture import StreamCapture, AudioChunk
from src.capture.youtube import resolve_stream_url
from src.transcriber.whisper_client import transcribe_audio
from src.analyzer.keyword_filter import check_keywords
from src.analyzer.claude_analyzer import analyze_transcription, AnalysisResult
from src.analyzer.deduplicator import build_dedup_hash, is_duplicate
from src.alerts.formatter import format_alert_message
from src.alerts.whatsapp import send_to_recipients, send_audio, filter_by_urgency
from src.reports.generator import generate_session_report
from src.core.logging_config import get_logger

logger = get_logger(__name__)

ALERT_URGENCIES = {"critical", "high"}


class MonitorJob:
    """
    Gerencia o ciclo completo de monitoramento de um programa de rádio.
    Processa cada chunk para todos os clientes (orgs) assinantes da rádio.
    """

    def __init__(self, program_id: str, session_id: str):
        self.program_id = program_id
        self.session_id = session_id
        self._capture: Optional[StreamCapture] = None
        self._running = False

    async def run(self) -> None:
        async with AsyncSessionLocal() as db:
            session = await self._load_session(db)
            if not session:
                return

            program = session.program
            station: RadioStation = program.station

            stream_url = await resolve_stream_url(station.stream_url, station.youtube_url)
            if not stream_url:
                await self._fail_session(db, session, "Não foi possível resolver URL do stream")
                return

            session.status = SessionStatus.running
            session.started_at = datetime.utcnow()
            await db.commit()

            logger.info(
                "monitor_job.started",
                session_id=self.session_id,
                program=program.name,
                station=station.name,
            )

        self._running = True

        self._capture = StreamCapture(
            stream_url=stream_url,
            session_id=self.session_id,
            chunk_duration=settings.CHUNK_DURATION_SECONDS,
            on_chunk=self._handle_chunk,
        )

        try:
            await self._capture.start()
        except asyncio.CancelledError:
            pass
        finally:
            self._running = False
            if self._capture:
                await self._capture.stop()
            await self._finalize()

    async def stop(self) -> None:
        self._running = False
        if self._capture:
            await self._capture.stop()

    # ─── Chunk handler ────────────────────────────────────────────────────────

    async def _handle_chunk(self, chunk: AudioChunk) -> None:
        """
        Processa um chunk de áudio para TODOS os clientes assinantes da rádio.
        transcreve (1x) → para cada org: filtra → analisa → dedup → alerta
        """
        async with AsyncSessionLocal() as db:
            session = await self._load_session(db)
            if not session:
                return

            program: Program = session.program
            station: RadioStation = program.station
            tz = pytz.timezone(program.timezone or "America/Sao_Paulo")
            chunk_time = chunk.started_at.replace(tzinfo=pytz.utc).astimezone(tz).strftime("%H:%M:%S")

            # 1. Transcrição única para todos os clientes
            transcription_result = await transcribe_audio(
                audio_path=chunk.file_path,
                chunk_index=chunk.index,
            )

            if not transcription_result or not transcription_result.text.strip():
                session.total_chunks += 1
                await db.commit()
                return

            text = transcription_result.text

            # 2. Coleta todos os orgs que devem processar este chunk
            org_ids = await self._get_subscriber_org_ids(db, station.id, station.org_id)

            # 3. Verifica se ALGUM org tem match de keyword
            any_match = False
            for org_id in org_ids:
                keywords_db = await self._load_keywords(db, org_id, program.id)
                has_match, _ = check_keywords(text, custom_keywords=keywords_db)
                if has_match:
                    any_match = True
                    break

            # 4. Salva transcrição uma vez (compartilhada)
            transcription_row = Transcription(
                session_id=self.session_id,
                chunk_index=chunk.index,
                chunk_started_at=chunk.started_at,
                duration_seconds=chunk.duration_seconds,
                raw_text=text,
                has_keywords=any_match,
                matched_keywords=[],
                audio_file_path=str(chunk.file_path),
                whisper_duration_ms=transcription_result.duration_ms,
            )
            db.add(transcription_row)
            await db.flush()

            session.total_chunks += 1
            await db.commit()

            if not any_match:
                return

            # 5. Processa para cada org independentemente
            for org_id in org_ids:
                try:
                    await self._process_for_org(
                        org_id=org_id,
                        transcription_id=transcription_row.id,
                        session_id=self.session_id,
                        text=text,
                        station=station,
                        program=program,
                        chunk_time=chunk_time,
                        program_id=program.id,
                        audio_path=chunk.file_path,
                    )
                except Exception as e:
                    logger.error("monitor_job.org_processing_error", org_id=org_id, error=str(e))

    # ─── Per-org processing ───────────────────────────────────────────────────

    async def _process_for_org(
        self,
        org_id: str,
        transcription_id: str,
        session_id: str,
        text: str,
        station: RadioStation,
        program: Program,
        chunk_time: str,
        program_id: str,
        audio_path: Optional[Path] = None,
    ) -> None:
        """Executa o pipeline completo (filtro → análise → alerta) para um cliente específico."""
        async with AsyncSessionLocal() as db:
            city_filter = await self._get_city_filter(db, station.id, org_id)

            # 1. Filtro por palavras-chave do cliente
            keywords_db = await self._load_keywords(db, org_id, program_id)
            has_match, matched = check_keywords(text, custom_keywords=keywords_db)

            if not has_match:
                return

            # 2. Análise Claude com contexto do cliente
            station_label = f"{station.name} ({city_filter})" if city_filter else station.name
            city_context = await self._get_org_city_context(db, org_id)
            org_system_prompt = await self._get_org_system_prompt(db, org_id)
            analysis_result: Optional[AnalysisResult] = await analyze_transcription(
                text=text,
                station_name=station_label,
                program_name=program.name,
                chunk_time=chunk_time,
                matched_keywords=matched,
                city_context=city_context,
                org_system_prompt=org_system_prompt,
            )

            if not analysis_result:
                return

            analysis_row = Analysis(
                transcription_id=transcription_id,
                org_id=org_id,
                is_relevant=analysis_result.is_relevant,
                theme=analysis_result.theme,
                sentiment=Sentiment(analysis_result.sentiment) if analysis_result.sentiment in Sentiment._value2member_map_ else Sentiment.neutral,
                urgency=Urgency(analysis_result.urgency) if analysis_result.urgency in Urgency._value2member_map_ else Urgency.low,
                content_type=ContentType(analysis_result.content_type) if analysis_result.content_type in ContentType._value2member_map_ else ContentType.other,
                confidence_score=analysis_result.confidence_score,
                summary=analysis_result.summary,
                excerpt=analysis_result.excerpt,
                reason=analysis_result.reason,
                suggested_action=analysis_result.suggested_action,
                raw_response=analysis_result.raw_response,
                claude_duration_ms=analysis_result.duration_ms,
            )
            db.add(analysis_row)
            await db.flush()

            if not analysis_result.is_relevant:
                await db.commit()
                return

            # 3. Deduplicação por org — usa content_type + primeiras palavras do tema
            # (não o texto completo, que varia a cada chunk mesmo para o mesmo assunto)
            theme_key = " ".join((analysis_result.theme or "").lower().split()[:4])
            dedup_hash = f"{org_id}:{build_dedup_hash(theme_key, analysis_result.content_type, station.name)}"

            if await is_duplicate(db, session_id, dedup_hash):
                alert_row = Alert(
                    session_id=session_id,
                    analysis_id=analysis_row.id,
                    org_id=org_id,
                    status=AlertStatus.suppressed,
                    dedup_hash=dedup_hash,
                    message_text="[SUPRIMIDO - DEDUPLICADO]",
                    recipients=[],
                )
                db.add(alert_row)
                await db.commit()
                return

            # 4. Verifica urgência mínima
            if analysis_result.urgency not in ALERT_URGENCIES:
                await db.commit()
                return

            # 5. Enriquece alerta com contexto histórico e cruzado
            recurrence_count = await self._count_theme_recurrence(db, dedup_hash)
            cross_radio = await self._get_cross_radio_stations(db, org_id, station.id)

            # 6. Formata e envia alerta
            message = format_alert_message(
                analysis=analysis_result,
                station_name=station.name,
                program_name=program.name,
                chunk_time=chunk_time,
                recurrence_count=recurrence_count,
                cross_radio_stations=cross_radio,
                dashboard_url=settings.DASHBOARD_URL,
            )

            recipients = await self._get_recipients(db, org_id, program, analysis_result.urgency)

            alert_row = Alert(
                session_id=session_id,
                analysis_id=analysis_row.id,
                org_id=org_id,
                status=AlertStatus.pending,
                dedup_hash=dedup_hash,
                message_text=message,
                recipients=recipients,
            )
            db.add(alert_row)
            await db.flush()

            clip_path = await self._prepare_audio_clip(audio_path, alert_row.id)
            asyncio.create_task(
                self._send_alert(alert_row.id, recipients, message, clip_path)
            )

            await db.commit()

            logger.info(
                "monitor_job.alert_triggered",
                org_id=org_id,
                theme=analysis_result.theme,
                urgency=analysis_result.urgency,
            )

    # ─── Helpers ──────────────────────────────────────────────────────────────

    async def _get_subscriber_org_ids(
        self, db: AsyncSession, station_id: str, owner_org_id: str
    ) -> list[str]:
        """Retorna o org dono + todos orgs assinantes ativos desta rádio."""
        result = await db.execute(
            select(StationSubscription.org_id).where(
                StationSubscription.station_id == station_id,
                StationSubscription.is_active == True,
            )
        )
        subscriber_ids = [row[0] for row in result.all()]

        all_org_ids = [owner_org_id]
        for org_id in subscriber_ids:
            if org_id != owner_org_id:
                all_org_ids.append(org_id)

        return all_org_ids

    async def _get_city_filter(
        self, db: AsyncSession, station_id: str, org_id: str
    ) -> Optional[str]:
        result = await db.execute(
            select(StationSubscription.city_filter).where(
                StationSubscription.station_id == station_id,
                StationSubscription.org_id == org_id,
            )
        )
        return result.scalar_one_or_none()

    async def _load_session(self, db: AsyncSession) -> Optional[MonitoringSession]:
        result = await db.execute(
            select(MonitoringSession)
            .options(
                selectinload(MonitoringSession.program).selectinload(Program.station)
            )
            .where(MonitoringSession.id == self.session_id)
        )
        session = result.scalar_one_or_none()
        if not session:
            logger.error("monitor_job.session_not_found", session_id=self.session_id)
        return session

    async def _get_org_city_context(self, db: AsyncSession, org_id: str) -> Optional[str]:
        org = await db.get(Organization, org_id)
        if not org or not org.settings:
            return None
        # Free-form context string takes priority (used by detailed Prompt Mestre configs)
        master = org.settings.get("master_prompt")
        if master and isinstance(master, str):
            return master
        ctx = org.settings.get("city_context")
        if not ctx or not isinstance(ctx, dict):
            return None
        lines = []
        if ctx.get("city"):
            lines.append(f"- Município: {ctx['city']}/{ctx.get('state', 'SC')}")
        for key, label in [
            ("prefeito", "Prefeito(a)"),
            ("vice_prefeito", "Vice-prefeito"),
            ("secretarios", "Secretários"),
            ("autarquias", "Autarquias"),
            ("camara", "Câmara Municipal"),
            ("vereadores", "Vereadores"),
            ("programas", "Equipamentos/Programas"),
            ("bairros", "Bairros"),
            ("temas_prioritarios", "Temas prioritários"),
        ]:
            val = ctx.get(key)
            if val:
                lines.append(f"- {label}: {val}")
        return "\n".join(lines) if lines else None

    async def _get_org_system_prompt(self, db: AsyncSession, org_id: str) -> Optional[str]:
        org = await db.get(Organization, org_id)
        if not org or not org.settings:
            return None
        return org.settings.get("system_prompt") or None

    async def _load_keywords(self, db: AsyncSession, org_id: str, program_id: str) -> list:
        from src.core.models import Keyword
        result = await db.execute(
            select(Keyword.term).where(
                Keyword.org_id == org_id,
                Keyword.is_active == True,
            )
        )
        return [row[0] for row in result.all()]

    async def _get_recipients(
        self,
        db: AsyncSession,
        org_id: str,
        program: Program,
        urgency: str,
    ) -> list:
        if program.alert_recipients:
            return program.alert_recipients

        result = await db.execute(
            select(AlertRecipient).where(
                AlertRecipient.org_id == org_id,
                AlertRecipient.is_active == True,
            )
        )
        all_recipients = result.scalars().all()

        recipient_dicts = [
            {"phone": r.phone, "urgency_filter": r.urgency_filter}
            for r in all_recipients
        ]

        filtered = filter_by_urgency(recipient_dicts, urgency)

        if not filtered:
            filtered = settings.alert_recipients_list

        return filtered

    async def _count_theme_recurrence(self, db: AsyncSession, dedup_hash: str) -> int:
        """Conta quantas vezes este tema gerou alerta nos últimos 7 dias para este org."""
        cutoff = datetime.utcnow() - timedelta(days=7)
        result = await db.execute(
            select(func.count()).select_from(Alert).where(
                Alert.dedup_hash == dedup_hash,
                Alert.status == AlertStatus.sent,
                Alert.sent_at >= cutoff,
            )
        )
        return result.scalar() or 0

    async def _get_cross_radio_stations(
        self, db: AsyncSession, org_id: str, current_station_id: str
    ) -> list[str]:
        """Retorna nomes de outras rádios que tiveram conteúdo relevante hoje para este org."""
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        result = await db.execute(
            select(RadioStation.name).distinct()
            .join(Program, Program.station_id == RadioStation.id)
            .join(MonitoringSession, MonitoringSession.program_id == Program.id)
            .join(Transcription, Transcription.session_id == MonitoringSession.id)
            .join(Analysis, Analysis.transcription_id == Transcription.id)
            .where(
                Analysis.org_id == org_id,
                Analysis.is_relevant == True,
                RadioStation.id != current_station_id,
                Transcription.created_at >= today_start,
            )
        )
        return [row[0] for row in result.all()]

    async def _prepare_audio_clip(
        self, audio_path: Optional[Path], alert_id: str
    ) -> Optional[Path]:
        """Converte chunk WAV para OGG Opus e salva em clips/ para persistência."""
        if not audio_path or not audio_path.exists():
            return None
        try:
            settings.CLIPS_DIR.mkdir(parents=True, exist_ok=True)
            ogg_path = settings.CLIPS_DIR / f"alert_{alert_id}.ogg"
            proc = await asyncio.create_subprocess_exec(
                "ffmpeg", "-y", "-i", str(audio_path),
                "-c:a", "libopus", "-b:a", "32k", "-ar", "24000", "-ac", "1",
                str(ogg_path),
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await proc.wait()
            if ogg_path.exists() and ogg_path.stat().st_size > 0:
                return ogg_path
            logger.warning("monitor_job.audio_convert_failed", alert_id=alert_id)
        except Exception as e:
            logger.error("monitor_job.audio_convert_error", error=str(e))
        return None

    async def _send_alert(
        self,
        alert_id: str,
        recipients: list,
        message: str,
        audio_path: Optional[Path] = None,
    ) -> None:
        results = await send_to_recipients(recipients, message)
        any_success = any(results.values())

        if audio_path and audio_path.exists():
            for phone in recipients:
                phone_str = phone if isinstance(phone, str) else phone.get("phone", "")
                if phone_str:
                    await send_audio(phone_str, audio_path)
            try:
                audio_path.unlink(missing_ok=True)
            except Exception:
                pass

        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Alert).where(Alert.id == alert_id))
            alert = result.scalar_one_or_none()
            if alert:
                alert.status = AlertStatus.sent if any_success else AlertStatus.failed
                alert.sent_at = datetime.utcnow()
                if not any_success:
                    alert.error_message = "Nenhum destinatário recebeu a mensagem"
                await db.commit()

    async def _fail_session(self, db: AsyncSession, session: MonitoringSession, reason: str) -> None:
        session.status = SessionStatus.failed
        session.error_message = reason
        session.ended_at = datetime.utcnow()
        await db.commit()
        logger.error("monitor_job.failed", session_id=self.session_id, reason=reason)

    async def _finalize(self) -> None:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(MonitoringSession)
                .options(
                    selectinload(MonitoringSession.program).selectinload(Program.station)
                )
                .where(MonitoringSession.id == self.session_id)
            )
            session = result.scalar_one_or_none()
            if not session:
                return

            session.status = SessionStatus.completed
            session.ended_at = datetime.utcnow()
            await db.commit()
            await db.refresh(session)

            report = await generate_session_report(db, session)

            if report:
                await self._send_report(session, report)

            logger.info(
                "monitor_job.finalized",
                session_id=self.session_id,
                total_chunks=session.total_chunks,
                relevant_chunks=session.relevant_chunks,
                alerts=session.total_alerts_sent,
            )

    async def _send_report(self, session: MonitoringSession, report) -> None:
        from src.alerts.formatter import format_report_message

        program = session.program
        station = program.station if program else None

        duration_min = 0
        if session.started_at and session.ended_at:
            duration_min = int((session.ended_at - session.started_at).total_seconds() / 60)

        message = format_report_message(
            program_name=program.name if program else "Desconhecido",
            station_name=station.name if station else "Desconhecida",
            duration_minutes=duration_min,
            total_chunks=session.total_chunks,
            relevant_count=report.total_mentions,
            alert_count=report.alert_count,
            high_urgency_count=report.high_urgency_count,
            key_topics=report.key_topics or [],
            timeline=report.timeline or [],
            recommendations=report.recommendations or [],
            overall_sentiment=report.overall_sentiment.value if report.overall_sentiment else None,
            general_summary=report.general_summary,
        )

        async with AsyncSessionLocal() as db:
            org_result = await db.execute(
                select(AlertRecipient).where(
                    AlertRecipient.org_id == station.org_id,
                    AlertRecipient.is_active == True,
                )
            )
            all_recipients = org_result.scalars().all()
            phones = [r.phone for r in all_recipients] or settings.alert_recipients_list

        if phones:
            await send_to_recipients(phones, message)
            report.whatsapp_status = "sent"
            report.sent_at = datetime.utcnow()
