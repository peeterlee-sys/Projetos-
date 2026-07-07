"""
Orquestrador principal de monitoramento.
Coordena captura → transcrição → filtro → análise → roteamento por cidade →
alerta (texto + áudio completo) para um programa de rádio.
Suporta múltiplos clientes monitorando a mesma rádio simultaneamente.
"""
import asyncio
from collections import deque
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
    Urgency, ContentType, AlertRecipient, StationSubscription, Organization,
    CaptureEvent, CaptureEventType,
)
from src.core.costs import estimate_whisper_cost, estimate_whatsapp_cost
from src.capture.stream_capture import StreamCapture, AudioChunk
from src.capture.youtube import resolve_stream_url
from src.capture.silence import is_silent_chunk
from src.capture.clip_builder import build_clip, wait_for_post_context
from src.transcriber.whisper_client import transcribe_audio
from src.analyzer.keyword_filter import check_keywords
from src.analyzer.claude_analyzer import analyze_transcription, AnalysisResult
from src.analyzer.deduplicator import build_dedup_hash, is_duplicate, is_similar_duplicate
from src.analyzer.city_router import decide_routing, ACTION_SEND, ACTION_REVIEW
from src.alerts.formatter import format_alert_message, format_operational_message, utc_to_brt_str
from src.alerts.whatsapp import send_to_recipients, send_audio_to_recipients, filter_by_urgency
from src.health.failure_classifier import classify_failure
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
        self._station_id: Optional[str] = None
        self._station_name: str = ""
        self._program_name: str = ""
        # Buffer rolante de transcrições para análise com contexto de bloco
        self._recent_texts: deque = deque(maxlen=max(settings.ANALYSIS_CONTEXT_CHUNKS, 1))
        self._first_chunk_seen = False
        self._ops_notified_classes: set = set()

    async def run(self) -> None:
        async with AsyncSessionLocal() as db:
            session = await self._load_session(db)
            if not session:
                return

            program = session.program
            station: RadioStation = program.station
            self._station_id = station.id
            self._station_name = station.name
            self._program_name = program.name

            stream_url = await resolve_stream_url(station.stream_url, station.youtube_url)
            if not stream_url:
                await self._record_capture_event(
                    CaptureEventType.resolve_failed,
                    error_class="invalid_url",
                    message="Não foi possível resolver URL do stream",
                )
                await self._notify_operations(
                    "invalid_url", "Não foi possível resolver URL do stream"
                )
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

        await self._record_capture_event(CaptureEventType.capture_started)

        self._running = True

        self._capture = StreamCapture(
            stream_url=stream_url,
            session_id=self.session_id,
            chunk_duration=settings.CHUNK_DURATION_SECONDS,
            on_chunk=self._handle_chunk,
            on_error=self._handle_capture_error,
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

    # ─── Saúde / eventos de captura ───────────────────────────────────────────

    async def _handle_capture_error(self, error_text: str, attempt: int) -> None:
        classification = classify_failure(error_text)
        await self._record_capture_event(
            CaptureEventType.reconnect if attempt <= settings.MAX_RECONNECT_ATTEMPTS
            else CaptureEventType.capture_failed,
            error_class=classification.error_class,
            message=error_text[:500],
            attempt=attempt,
        )
        # Notifica operações no primeiro erro de cada classe e no esgotamento
        should_notify = (
            classification.error_class not in self._ops_notified_classes
            or attempt > settings.MAX_RECONNECT_ATTEMPTS
        )
        if should_notify and (classification.needs_human or attempt > settings.MAX_RECONNECT_ATTEMPTS):
            self._ops_notified_classes.add(classification.error_class)
            await self._notify_operations(classification.error_class, error_text)

    async def _record_capture_event(
        self,
        event_type: CaptureEventType,
        error_class: Optional[str] = None,
        message: Optional[str] = None,
        attempt: int = 0,
    ) -> None:
        if not self._station_id:
            return
        try:
            async with AsyncSessionLocal() as db:
                db.add(CaptureEvent(
                    station_id=self._station_id,
                    program_id=self.program_id,
                    session_id=self.session_id,
                    event_type=event_type,
                    error_class=error_class,
                    message=message,
                    attempt=attempt,
                ))
                await db.commit()
        except Exception as e:
            logger.warning("monitor_job.capture_event_write_failed", error=str(e))

    async def _notify_operations(self, error_class: str, detail: str) -> None:
        phones = settings.operations_recipients_list
        if not phones:
            return
        message = format_operational_message(
            station_name=self._station_name,
            program_name=self._program_name,
            error_class=error_class,
            detail=detail,
            event_id=f"capture:{self.session_id[:8]}",
        )
        try:
            await send_to_recipients(phones, message)
        except Exception as e:
            logger.warning("monitor_job.ops_notify_failed", error=str(e))

    # ─── Chunk handler ────────────────────────────────────────────────────────

    async def _handle_chunk(self, chunk: AudioChunk) -> None:
        """
        Processa um chunk de áudio para TODOS os clientes assinantes da rádio.
        silêncio? → descarta | transcreve (1x) → para cada org:
        filtra → analisa (com contexto de bloco) → roteia por cidade →
        dedup → alerta com áudio completo
        """
        if not self._first_chunk_seen:
            self._first_chunk_seen = True
            await self._record_capture_event(CaptureEventType.capture_success)

        # 0. Pula silêncio/sinal morto — economiza Whisper
        if await is_silent_chunk(chunk.file_path):
            async with AsyncSessionLocal() as db:
                session = await self._load_session(db)
                if session:
                    session.total_chunks += 1
                    await db.commit()
            return

        async with AsyncSessionLocal() as db:
            session = await self._load_session(db)
            if not session:
                return

            program: Program = session.program
            station: RadioStation = program.station
            chunk_time = utc_to_brt_str(chunk.started_at)

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
            self._recent_texts.append((chunk.index, text))
            # Bloco de contexto: chunks anteriores + atual (a menção pode
            # começar antes do chunk que disparou a keyword)
            context_text = " ".join(t for _, t in self._recent_texts)

            # 2. Coleta todos os orgs que devem processar este chunk
            org_ids = await self._get_subscriber_org_ids(db, station.id, station.org_id)

            # 3. Verifica se ALGUM org tem match de keyword (no bloco de contexto)
            any_match = False
            for org_id in org_ids:
                keywords_db = await self._load_keywords(db, org_id, program.id)
                has_match, _ = check_keywords(context_text, custom_keywords=keywords_db)
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

            whisper_cost = estimate_whisper_cost(chunk.duration_seconds)

            # 5. Processa para cada org independentemente
            for org_id in org_ids:
                try:
                    await self._process_for_org(
                        org_id=org_id,
                        transcription_id=transcription_row.id,
                        session_id=self.session_id,
                        text=context_text,
                        station=station,
                        program=program,
                        chunk_time=chunk_time,
                        program_id=program.id,
                        chunk=chunk,
                        whisper_cost=whisper_cost,
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
        chunk: AudioChunk,
        whisper_cost: float,
    ) -> None:
        """Pipeline completo (filtro → análise → roteamento → dedup → alerta) por cliente."""
        async with AsyncSessionLocal() as db:
            city_filter = await self._get_city_filter(db, station.id, org_id)
            org = await db.get(Organization, org_id)
            contracted_city = city_filter or (org.city if org else None)

            # 1. Filtro por palavras-chave do cliente
            keywords_db = await self._load_keywords(db, org_id, program_id)
            has_match, matched = check_keywords(text, custom_keywords=keywords_db)

            if not has_match:
                return

            # 2. Análise Claude com contexto do cliente + classificação de cidade
            station_label = f"{station.name} ({city_filter})" if city_filter else station.name
            city_context = await self._get_org_city_context(db, org_id)
            analysis_result: Optional[AnalysisResult] = await analyze_transcription(
                text=text,
                station_name=station_label,
                program_name=program.name,
                chunk_time=chunk_time,
                matched_keywords=matched,
                city_context=city_context,
                contracted_city=contracted_city,
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
                primary_city=analysis_result.primary_city,
                mentioned_cities=analysis_result.mentioned_cities or [],
                affected_cities=analysis_result.affected_cities or [],
                related_department=analysis_result.related_department,
                city_confidence=analysis_result.city_confidence,
                city_reasoning=analysis_result.city_reasoning,
                input_tokens=analysis_result.input_tokens,
                output_tokens=analysis_result.output_tokens,
                estimated_cost_usd=analysis_result.estimated_cost_usd,
            )
            db.add(analysis_row)
            await db.flush()

            if not analysis_result.is_relevant:
                await db.commit()
                return

            estimated_cost = whisper_cost + (analysis_result.estimated_cost_usd or 0.0)

            # 3. Roteamento por cidade — NUNCA enviar só por keyword
            routing = decide_routing(
                contracted_city=contracted_city,
                primary_city=analysis_result.primary_city,
                affected_cities=analysis_result.affected_cities,
                city_confidence=analysis_result.city_confidence,
            )

            if not routing.should_send:
                status = (
                    AlertStatus.needs_review if routing.action == ACTION_REVIEW
                    else AlertStatus.blocked
                )
                db.add(Alert(
                    session_id=session_id,
                    analysis_id=analysis_row.id,
                    org_id=org_id,
                    status=status,
                    message_text=f"[{status.value.upper()}] {analysis_result.theme}",
                    recipients=[],
                    contracted_city=contracted_city,
                    detected_city=analysis_result.primary_city,
                    routing_decision=routing.action,
                    routing_reason=routing.reason,
                    estimated_cost_usd=estimated_cost,
                ))
                await db.commit()
                logger.info(
                    "monitor_job.alert_routed_out",
                    org_id=org_id,
                    action=routing.action,
                    contracted_city=contracted_city,
                    detected_city=analysis_result.primary_city,
                    reason=routing.reason,
                )
                return

            # 4. Deduplicação por org — hash exato + similaridade textual
            theme_key = " ".join((analysis_result.theme or "").lower().split()[:4])
            dedup_hash = f"{org_id}:{build_dedup_hash(theme_key, analysis_result.content_type, station.name)}"

            duplicate = await is_duplicate(db, session_id, dedup_hash)
            if not duplicate:
                duplicate = await is_similar_duplicate(
                    db, org_id, analysis_result.theme or "", analysis_result.summary or ""
                )

            if duplicate:
                db.add(Alert(
                    session_id=session_id,
                    analysis_id=analysis_row.id,
                    org_id=org_id,
                    status=AlertStatus.suppressed,
                    dedup_hash=dedup_hash,
                    message_text="[SUPRIMIDO - DEDUPLICADO]",
                    recipients=[],
                    contracted_city=contracted_city,
                    detected_city=analysis_result.primary_city,
                    routing_decision="suppressed",
                    routing_reason="Mesmo assunto já alertado dentro da janela de deduplicação.",
                    estimated_cost_usd=estimated_cost,
                ))
                await db.commit()
                return

            # 5. Verifica urgência mínima
            if analysis_result.urgency not in ALERT_URGENCIES:
                await db.commit()
                return

            # 6. Formata e envia alerta (texto agora, áudio completo em seguida)
            recipients = await self._get_recipients(db, org_id, program, analysis_result.urgency)

            audio_url = None
            if settings.PUBLIC_BASE_URL:
                audio_url = f"{settings.PUBLIC_BASE_URL.rstrip('/')}/api/v1/clips/{transcription_id}"

            message = format_alert_message(
                analysis=analysis_result,
                station_name=station.name,
                program_name=program.name,
                chunk_time=chunk_time,
                city=contracted_city,
                routing_reason=routing.reason,
                audio_note="O áudio completo do trecho chega em seguida nesta conversa.",
                audio_url=audio_url,
            )

            estimated_cost += estimate_whatsapp_cost(len(recipients) * 2)  # texto + áudio

            alert_row = Alert(
                session_id=session_id,
                analysis_id=analysis_row.id,
                org_id=org_id,
                status=AlertStatus.pending,
                dedup_hash=dedup_hash,
                message_text=message,
                recipients=recipients,
                contracted_city=contracted_city,
                detected_city=analysis_result.primary_city,
                routing_decision=ACTION_SEND,
                routing_reason=routing.reason,
                audio_url=audio_url,
                audio_status="pending",
                estimated_cost_usd=estimated_cost,
            )
            db.add(alert_row)
            await db.flush()
            alert_id = alert_row.id

            asyncio.create_task(
                self._send_alert_with_audio(
                    alert_id=alert_id,
                    recipients=recipients,
                    message=message,
                    transcription_id=transcription_id,
                    chunk_dir=chunk.file_path.parent,
                    chunk_index=chunk.index,
                    audio_url=audio_url,
                )
            )

            await db.commit()

            logger.info(
                "monitor_job.alert_triggered",
                org_id=org_id,
                theme=analysis_result.theme,
                urgency=analysis_result.urgency,
                contracted_city=contracted_city,
                detected_city=analysis_result.primary_city,
                cost_usd=estimated_cost,
            )

    # ─── Envio: texto + áudio completo ────────────────────────────────────────

    async def _send_alert_with_audio(
        self,
        alert_id: str,
        recipients: list,
        message: str,
        transcription_id: str,
        chunk_dir: Path,
        chunk_index: int,
        audio_url: Optional[str],
    ) -> None:
        # 1. Texto imediatamente
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

        # 2. Aguarda o contexto posterior e monta o clip completo
        audio_status = "none"
        clip_path_str = None
        try:
            await wait_for_post_context(chunk_dir, chunk_index)
            clip = await build_clip(chunk_dir, chunk_index, self.session_id)
            if clip:
                clip_path_str = str(clip.file_path)
                if clip.truncated:
                    # Limite técnico: envia link (se houver) e registra a limitação
                    audio_status = "link_only" if audio_url else "failed"
                    logger.warning(
                        "alert.audio_over_limit",
                        alert_id=alert_id,
                        size_bytes=clip.size_bytes,
                    )
                    if audio_url:
                        note = f"⚠️ Áudio excede o limite do WhatsApp — ouça completo em: {audio_url}"
                        await send_to_recipients(recipients, note)
                else:
                    audio_results = await send_audio_to_recipients(
                        recipients, audio_path=clip.file_path
                    )
                    audio_status = "sent" if any(audio_results.values()) else "failed"
                    if audio_status == "failed" and audio_url:
                        note = f"⚠️ Falha no envio do áudio — ouça completo em: {audio_url}"
                        await send_to_recipients(recipients, note)
                        audio_status = "link_only"
            else:
                audio_status = "failed"
        except Exception as e:
            logger.error("alert.audio_pipeline_error", alert_id=alert_id, error=str(e))
            audio_status = "failed"

        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Alert).where(Alert.id == alert_id))
            alert = result.scalar_one_or_none()
            if alert:
                alert.audio_status = audio_status
                alert.clip_file_path = clip_path_str
                await db.commit()

            # vincula o clip à transcrição para o endpoint público de download
            if clip_path_str:
                t = await db.get(Transcription, transcription_id)
                if t:
                    t.clip_file_path = clip_path_str
                    await db.commit()

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
        ctx = org.settings.get("city_context")
        if not ctx or not isinstance(ctx, dict):
            return None
        lines = []
        if ctx.get("city"):
            lines.append(f"- Município: {ctx['city']}/{ctx.get('state', 'SC')}")
        for key, label in [
            ("prefeito", "Prefeito"),
            ("vice_prefeito", "Vice-prefeito"),
            ("secretarios", "Secretários"),
            ("camara", "Câmara Municipal"),
            ("programas", "Programas/Projetos"),
            ("bairros", "Bairros"),
        ]:
            val = ctx.get(key)
            if val:
                lines.append(f"- {label}: {val}")
        return "\n".join(lines) if lines else None

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
