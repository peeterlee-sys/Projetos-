"""
Orquestrador principal de monitoramento.
Coordena captura → transcrição → filtro → análise → alerta para um programa de rádio.
"""
import asyncio
from datetime import datetime
from pathlib import Path
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import settings
from src.core.database import AsyncSessionLocal
from src.core.models import (
    MonitoringSession, Program, RadioStation, Transcription,
    Analysis, Alert, AlertStatus, SessionStatus, Sentiment,
    Urgency, ContentType, AlertRecipient,
)
from src.capture.stream_capture import StreamCapture, AudioChunk
from src.capture.youtube import resolve_stream_url
from src.transcriber.whisper_client import transcribe_audio
from src.analyzer.keyword_filter import check_keywords
from src.analyzer.claude_analyzer import analyze_transcription, AnalysisResult
from src.analyzer.deduplicator import build_dedup_hash, is_duplicate
from src.alerts.formatter import format_alert_message
from src.alerts.whatsapp import send_to_recipients, filter_by_urgency
from src.reports.generator import generate_session_report
from src.core.logging_config import get_logger

logger = get_logger(__name__)

# Urgências que sempre disparam alerta imediato
ALERT_URGENCIES = {"critical", "high", "medium"}


class MonitorJob:
    """
    Gerencia o ciclo completo de monitoramento de um programa de rádio.
    Instanciado e controlado pelo JobManager.
    """

    def __init__(self, program_id: str, session_id: str):
        self.program_id = program_id
        self.session_id = session_id
        self._capture: Optional[StreamCapture] = None
        self._running = False

    async def run(self) -> None:
        """Ponto de entrada principal. Roda até o programa terminar ou erro."""
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
            await self._finalize()

    async def stop(self) -> None:
        """Para o monitoramento graciosamente."""
        self._running = False
        if self._capture:
            await self._capture.stop()

    # ─── Chunk handler ────────────────────────────────────────────────────────

    async def _handle_chunk(self, chunk: AudioChunk) -> None:
        """
        Processa um chunk de áudio:
        transcreve → filtra → analisa → dedup → alerta.
        """
        async with AsyncSessionLocal() as db:
            session = await self._load_session(db)
            if not session:
                return

            program: Program = session.program
            station: RadioStation = program.station
            chunk_time = chunk.started_at.strftime("%H:%M:%S")

            # 1. Transcrição
            transcription_result = await transcribe_audio(
                audio_path=chunk.file_path,
                chunk_index=chunk.index,
            )

            if not transcription_result or not transcription_result.text.strip():
                session.total_chunks += 1
                await db.commit()
                return

            text = transcription_result.text

            # 2. Filtro por palavras-chave
            keywords_db = await self._load_keywords(db, program.station.org_id, program.id)
            has_match, matched = check_keywords(text, custom_keywords=keywords_db)

            transcription_row = Transcription(
                session_id=self.session_id,
                chunk_index=chunk.index,
                chunk_started_at=chunk.started_at,
                duration_seconds=chunk.duration_seconds,
                raw_text=text,
                has_keywords=has_match,
                matched_keywords=matched,
                audio_file_path=str(chunk.file_path),
                whisper_duration_ms=transcription_result.duration_ms,
            )
            db.add(transcription_row)
            await db.flush()

            session.total_chunks += 1

            if not has_match:
                await db.commit()
                return

            # 3. Análise Claude
            analysis_result: Optional[AnalysisResult] = await analyze_transcription(
                text=text,
                station_name=station.name,
                program_name=program.name,
                chunk_time=chunk_time,
                matched_keywords=matched,
            )

            if not analysis_result:
                await db.commit()
                return

            analysis_row = Analysis(
                transcription_id=transcription_row.id,
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

            session.relevant_chunks += 1

            # 4. Deduplicação
            dedup_hash = build_dedup_hash(
                theme=analysis_result.theme,
                content_type=analysis_result.content_type,
                station_name=station.name,
            )

            if await is_duplicate(db, self.session_id, dedup_hash):
                # Cria alerta suprimido para rastreio
                alert_row = Alert(
                    session_id=self.session_id,
                    analysis_id=analysis_row.id,
                    status=AlertStatus.suppressed,
                    dedup_hash=dedup_hash,
                    message_text="[SUPRIMIDO - DEDUPLICADO]",
                    recipients=[],
                )
                db.add(alert_row)
                await db.commit()
                return

            # 5. Verifica urgência mínima para alerta
            if analysis_result.urgency not in ALERT_URGENCIES:
                await db.commit()
                return

            # 6. Formata e envia alertas
            message = format_alert_message(
                analysis=analysis_result,
                station_name=station.name,
                program_name=program.name,
                chunk_time=chunk_time,
            )

            recipients = await self._get_recipients(db, station.org_id, program, analysis_result.urgency)

            alert_row = Alert(
                session_id=self.session_id,
                analysis_id=analysis_row.id,
                status=AlertStatus.pending,
                dedup_hash=dedup_hash,
                message_text=message,
                recipients=recipients,
            )
            db.add(alert_row)
            await db.flush()

            # Envia de forma assíncrona (não bloqueia o loop principal)
            asyncio.create_task(
                self._send_alert(alert_row.id, recipients, message)
            )

            session.total_alerts_sent += 1
            await db.commit()

    # ─── Helpers ──────────────────────────────────────────────────────────────

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
        # Destinatários específicos do programa têm prioridade
        if program.alert_recipients:
            return program.alert_recipients

        # Senão, usa destinatários da organização filtrados por urgência
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

        # Fallback para variável de ambiente
        if not filtered:
            filtered = settings.alert_recipients_list

        return filtered

    async def _send_alert(self, alert_id: str, recipients: list, message: str) -> None:
        """Envia alerta e atualiza status no banco."""
        results = await send_to_recipients(recipients, message)
        any_success = any(results.values())

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
        """Encerra sessão e gera relatório."""
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

            # Gera relatório consolidado
            report = await generate_session_report(db, session)

            if report and report.total_mentions > 0:
                await self._send_report(session, report)

            # Limpa chunks temporários
            if self._capture:
                self._capture.cleanup_chunks()

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
