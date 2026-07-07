"""
Orquestrador principal de monitoramento.
Coordena captura → transcrição → filtro → análise → alerta para um programa de rádio.
Suporta múltiplos clientes monitorando a mesma rádio simultaneamente.
"""
import asyncio
import time
from collections import deque
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
from src.capture.youtube import resolve_stream_url, build_ytdlp_stream_cmd, is_youtube_url
from src.transcriber.whisper_client import transcribe_audio
from src.transcriber.audio_gate import should_transcribe
from src.analyzer.keyword_filter import check_keywords, _normalize
from src.analyzer.claude_analyzer import analyze_transcription, AnalysisResult
from src.analyzer.deduplicator import build_dedup_hash, is_duplicate
from src.alerts.formatter import format_alert_message
from src.alerts.whatsapp import send_to_recipients, send_audio, filter_by_urgency
from src.reports.generator import (
    generate_session_report, _themes_similar, _normalize_theme, _THEME_STOPWORDS,
)
from src.core.admin_notify import notify_admin
from src.core.logging_config import get_logger

logger = get_logger(__name__)

ALERT_URGENCIES = {"critical", "high"}
_URG_SEVERITY = {"low": 0, "medium": 1, "high": 2, "critical": 3}


def _alert_theme_match(a: str, b: str) -> bool:
    """
    Similaridade de tema para FUNDIR alertas do mesmo assunto na sessão.
    Um pouco mais agressiva que a dos relatórios: aceita tokens curtos (UPA,
    ETE) e usa contenção no conjunto menor — o modelo redige o mesmo assunto
    com palavras diferentes a cada bloco.
    """
    if _themes_similar(a, b):
        return True
    ta = {w for w in _normalize_theme(a).split() if len(w) >= 3 and w not in _THEME_STOPWORDS}
    tb = {w for w in _normalize_theme(b).split() if len(w) >= 3 and w not in _THEME_STOPWORDS}
    if not ta or not tb:
        return False

    def _tok_eq(x: str, y: str) -> bool:
        # casa flexões simples: obra/obras, prejudica/prejudicam
        return x == y or (min(len(x), len(y)) >= 4 and (x.startswith(y) or y.startswith(x)))

    inter = sum(1 for x in ta if any(_tok_eq(x, y) for y in tb))
    return inter >= 2 and inter / min(len(ta), len(tb)) >= 0.6


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
        # Agregação de alertas por assunto (chave = dedup_hash):
        self._pending: dict[str, dict] = {}     # assuntos aguardando envio
        self._alerted_keys: set[str] = set()    # assuntos já alertados nesta sessão
        self._alerted_themes: dict[str, tuple] = {}  # key → (org_id, theme) p/ merge
        self._pending_lock = asyncio.Lock()
        # Janela de contexto da análise: textos dos últimos N blocos (incl. atual).
        # A análise roda sobre a janela inteira para não perder a gravidade de um
        # assunto cortado entre blocos de 30s.
        self._ctx_window: deque = deque(maxlen=max(1, settings.CHUNK_CONTEXT_WINDOW))

    async def run(self) -> None:
        async with AsyncSessionLocal() as db:
            session = await self._load_session(db)
            if not session:
                return

            program = session.program
            station: RadioStation = program.station
            station_stream_url = station.stream_url
            station_youtube_url = station.youtube_url
            program_end_time = program.end_time
            program_tz = program.timezone or "America/Sao_Paulo"
            program_name = program.name
            station_name = station.name

        # Resolve com retry até o fim da janela do programa
        # (YouTube Live pode subir atrasado; stream pode voltar do ar)
        stream_url = None
        try:
            stream_url = await self._resolve_stream_with_retry(
                station_stream_url, station_youtube_url, program_end_time, program_tz
            )
        except asyncio.CancelledError:
            pass

        async with AsyncSessionLocal() as db:
            session = await self._load_session(db)
            if not session:
                return

            if not stream_url:
                await self._fail_session(db, session, "Não foi possível resolver URL do stream")
                return

            session.status = SessionStatus.running
            session.started_at = datetime.utcnow()
            await db.commit()

            logger.info(
                "monitor_job.started",
                session_id=self.session_id,
                program=program_name,
                station=station_name,
            )

        self._running = True

        # Estação YouTube: usa o modo pipe (yt-dlp de longa duração → ffmpeg),
        # uma só conexão com o YouTube evita HTTP 429. O stream_url resolvido
        # acima serviu apenas como sinal de que a transmissão está no ar.
        is_youtube = not station_stream_url and is_youtube_url(station_youtube_url)
        if is_youtube:
            ytdlp_cmd = build_ytdlp_stream_cmd(station_youtube_url)
            self._capture = StreamCapture(
                stream_url=stream_url,
                session_id=self.session_id,
                chunk_duration=settings.CHUNK_DURATION_SECONDS,
                on_chunk=self._handle_chunk,
                ytdlp_cmd=ytdlp_cmd,
            )
        else:
            async def _refresh_url() -> Optional[str]:
                return await resolve_stream_url(station_stream_url, station_youtube_url)

            self._capture = StreamCapture(
                stream_url=stream_url,
                session_id=self.session_id,
                chunk_duration=settings.CHUNK_DURATION_SECONDS,
                on_chunk=self._handle_chunk,
                url_resolver=_refresh_url,
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

    async def _resolve_stream_with_retry(
        self,
        station_stream_url: Optional[str],
        station_youtube_url: Optional[str],
        program_end_time: str,
        program_tz: str,
        retry_interval: int = 120,
    ) -> Optional[str]:
        """
        Tenta resolver a URL do stream; se falhar, tenta novamente a cada
        retry_interval segundos até o fim da janela do programa.
        """
        tz = pytz.timezone(program_tz)
        end_h, end_m = map(int, program_end_time.split(":"))
        attempt = 0

        while True:
            url = await resolve_stream_url(station_stream_url, station_youtube_url)
            if url:
                if attempt:
                    logger.info(
                        "monitor_job.stream_resolved_after_retry",
                        session_id=self.session_id,
                        attempts=attempt,
                    )
                return url

            attempt += 1
            now = datetime.now(tz)
            end_dt = now.replace(hour=end_h, minute=end_m, second=0, microsecond=0)
            if now >= end_dt - timedelta(seconds=retry_interval):
                logger.error(
                    "monitor_job.stream_resolve_gave_up",
                    session_id=self.session_id,
                    attempts=attempt,
                )
                return None

            # Watchdog: avisa o admin já na 3ª tentativa (não espera o fim da
            # janela) — dá tempo de agir enquanto o programa ainda está no ar.
            if attempt == 3:
                await notify_admin(
                    f"stream_unavailable:{self.program_id}",
                    f"⚠️ *Stream fora do ar* (3 tentativas)\n"
                    f"Sessão {self.session_id[:8]} — seguirei tentando a cada "
                    f"{retry_interval}s até o fim da janela do programa.",
                )

            logger.warning(
                "monitor_job.stream_unavailable_retrying",
                session_id=self.session_id,
                attempt=attempt,
                retry_in_seconds=retry_interval,
            )
            await asyncio.sleep(retry_interval)

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

            # 1a. Gate de silêncio: bloco mudo não paga transcrição
            if not await should_transcribe(chunk.file_path, chunk.index):
                session.total_chunks += 1
                await db.commit()
                return

            # 1b. Transcrição única para todos os clientes
            transcription_result = await transcribe_audio(
                audio_path=chunk.file_path,
                chunk_index=chunk.index,
            )

            if not transcription_result or not transcription_result.text.strip():
                session.total_chunks += 1
                await db.commit()
                return

            text = transcription_result.text

            # Janela de contexto: análise roda sobre os últimos N blocos juntos,
            # mas a transcrição é salva por bloco (para relatório/timeline).
            self._ctx_window.append(text)
            window_text = " ".join(t for t in self._ctx_window if t)

            # 2. Coleta todos os orgs que devem processar este chunk
            org_ids = await self._get_subscriber_org_ids(db, station.id, station.org_id)
            shared_station = len(org_ids) > 1
            norm_text = _normalize(window_text)

            # 3. Decide QUAIS orgs analisar. Numa rádio compartilhada por vários
            # clientes, só analisa a org cuja CIDADE (ou palavra-chave própria dela)
            # aparece no trecho — evita pagar N análises quando o assunto é de uma
            # cidade só (as palavras genéricas casavam para todas). Em rádio
            # dedicada (1 assinante), mantém o filtro amplo com defaults.
            orgs_to_process: list[str] = []
            for org_id in org_ids:
                keywords_db = await self._load_keywords(db, org_id, program.id)
                if shared_station:
                    city = await self._get_city_filter(db, station.id, org_id)
                    city_hit = bool(city) and _normalize(city) in norm_text
                    kw_hit, _ = check_keywords(
                        window_text, custom_keywords=keywords_db, include_defaults=False
                    )
                    if city_hit or kw_hit:
                        orgs_to_process.append(org_id)
                else:
                    has_match, _ = check_keywords(window_text, custom_keywords=keywords_db)
                    if has_match:
                        orgs_to_process.append(org_id)

            any_match = bool(orgs_to_process)

            # 4. Salva transcrição uma vez (compartilhada) — só o texto do bloco atual
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

            # 5. Processa só as orgs selecionadas — analisa a JANELA de contexto
            for org_id in orgs_to_process:
                try:
                    await self._process_for_org(
                        org_id=org_id,
                        transcription_id=transcription_row.id,
                        session_id=self.session_id,
                        text=window_text,
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

            # 2. Análise Claude com contexto do cliente.
            # O rótulo da rádio usa a cidade REAL dela (não a do assinante!) —
            # rotular "Menina FM (Itapema)" induzia o modelo a atribuir conteúdo
            # de Balneário Camboriú ao cliente errado.
            station_label = (
                f"{station.name} (rádio de {station.city})" if station.city else station.name
            )
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
                monitored_city=city_filter,
                station_city=station.city,
            )

            if not analysis_result:
                return

            # 2b. Checagem MECÂNICA de cidade: se este cliente monitora uma cidade
            # específica, o conteúdo só é dele se o modelo atribuiu essa cidade.
            # "incerta" ou outra cidade → não é deste cliente (nem alerta, nem
            # clipagem) — mata o alerta de hospital de BC entregue como Itapema.
            if city_filter and analysis_result.is_relevant:
                attributed = _normalize(analysis_result.city_mentioned or "")
                wanted = _normalize(city_filter)
                if wanted not in attributed:
                    logger.info(
                        "analyzer.city_mismatch_suppressed",
                        org_city=city_filter,
                        city_mentioned=analysis_result.city_mentioned,
                        theme=analysis_result.theme,
                    )
                    analysis_result.is_relevant = False

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

            # 3. Chave do assunto (org + tema + tipo + rádio) para agregar/deduplicar
            theme_key = " ".join((analysis_result.theme or "").lower().split()[:4])
            dedup_hash = f"{org_id}:{build_dedup_hash(theme_key, analysis_result.content_type, station.name)}"

            # 4. Só assuntos ALTA/CRÍTICO viram alerta (o resto entra só no relatório)
            if analysis_result.urgency not in ALERT_URGENCIES:
                await db.commit()
                return

            # 4b. Confiança baixa não dispara automático — fica no relatório/clipagem.
            if (analysis_result.confidence_score or 0) < settings.ALERT_MIN_CONFIDENCE:
                logger.info(
                    "alert.low_confidence_suppressed",
                    org_id=org_id,
                    confidence=analysis_result.confidence_score,
                    theme=analysis_result.theme,
                )
                await db.commit()
                return

            # Rastreabilidade da decisão de roteamento (auditoria: por que enviou)
            logger.info(
                "alert.routing",
                org_id=org_id,
                monitored_city=city_filter,
                city_mentioned=analysis_result.city_mentioned,
                confidence=analysis_result.confidence_score,
                urgency=analysis_result.urgency,
                theme=analysis_result.theme,
                station=station.name,
            )

            # 5. Enriquece e formata a mensagem deste bloco
            recurrence_count = await self._count_theme_recurrence(db, dedup_hash)
            cross_radio = await self._get_cross_radio_stations(db, org_id, station.id)
            org_row = await db.get(Organization, org_id)
            message = format_alert_message(
                analysis=analysis_result,
                station_name=station.name,
                program_name=program.name,
                chunk_time=chunk_time,
                recurrence_count=recurrence_count,
                cross_radio_stations=cross_radio,
                dashboard_url=settings.DASHBOARD_URL,
                org_name=org_row.name if org_row else None,
            )
            recipients = await self._get_recipients(db, org_id, program, analysis_result.urgency)
            await db.commit()

        # 6. Agrega por assunto: junta blocos consecutivos e envia um alerta só
        await self._enqueue_alert(
            key=dedup_hash,
            org_id=org_id,
            session_id=session_id,
            analysis_id=analysis_row.id,
            message=message,
            recipients=recipients,
            audio_path=audio_path,
            urgency=analysis_result.urgency,
            theme=analysis_result.theme,
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

    # ─── Agregação de alertas por assunto ──────────────────────────────────────

    async def _enqueue_alert(
        self, key: str, org_id: str, session_id: str, analysis_id: str,
        message: str, recipients: list, audio_path: Optional[Path],
        urgency: str, theme: Optional[str],
    ) -> None:
        """
        Adiciona o bloco a um buffer por assunto. O primeiro bloco abre a janela;
        blocos seguintes do mesmo assunto acumulam o áudio e adiam o envio.
        """
        quiet = settings.ALERT_AGG_QUIET_SECONDS
        maxwin = settings.ALERT_AGG_MAX_WINDOW_SECONDS
        now = time.monotonic()

        async with self._pending_lock:
            # O modelo redige o tema com palavras diferentes a cada bloco
            # ("Falta de raio-x na UPA" / "Reclamação sobre raio-x no hospital"),
            # o que fragmentava o assunto em vários alertas. Antes de abrir um
            # buffer novo, procura um assunto SIMILAR já em andamento (ou já
            # alertado) deste mesmo cliente e funde neste.
            merge_key = self._find_merge_key(org_id, theme)
            if merge_key:
                key = merge_key

            # Assunto já alertado nesta sessão → não repete (fica só no relatório)
            if key in self._alerted_keys:
                return

            buf = self._pending.get(key)
            if buf is None:
                buf = {
                    "org_id": org_id,
                    "session_id": session_id,
                    "analysis_id": analysis_id,
                    "message": message,
                    "recipients": recipients,
                    "urgency": urgency,
                    "theme": theme,
                    "chunk_paths": [audio_path] if audio_path else [],
                    "started": now,
                    "last_update": now,
                    "flush_task": None,
                }
                self._pending[key] = buf
                logger.info("monitor_job.alert_buffering_started", org_id=org_id, theme=theme, urgency=urgency)
            else:
                if audio_path:
                    buf["chunk_paths"].append(audio_path)
                buf["last_update"] = now
                # Mantém a mensagem/análise do bloco de maior urgência
                if _URG_SEVERITY.get(urgency, 0) > _URG_SEVERITY.get(buf["urgency"], 0):
                    buf["message"] = message
                    buf["analysis_id"] = analysis_id
                    buf["urgency"] = urgency

            # (Re)agenda o envio
            if buf["flush_task"]:
                buf["flush_task"].cancel()
            delay = 0 if (now - buf["started"]) >= maxwin else quiet
            buf["flush_task"] = asyncio.create_task(self._flush_after(key, delay))

    def _find_merge_key(self, org_id: str, theme: Optional[str]) -> Optional[str]:
        """Chave de um assunto similar já em buffer/alertado para o mesmo cliente."""
        if not theme:
            return None
        for k, buf in self._pending.items():
            if buf["org_id"] == org_id and buf.get("theme") and _alert_theme_match(theme, buf["theme"]):
                return k
        for k, (oid, t) in self._alerted_themes.items():
            if oid == org_id and t and _alert_theme_match(theme, t):
                return k
        return None

    async def _flush_after(self, key: str, delay: float) -> None:
        try:
            if delay > 0:
                await asyncio.sleep(delay)
        except asyncio.CancelledError:
            return
        quiet = settings.ALERT_AGG_QUIET_SECONDS
        maxwin = settings.ALERT_AGG_MAX_WINDOW_SECONDS
        async with self._pending_lock:
            buf = self._pending.get(key)
            if not buf:
                return
            now = time.monotonic()
            quiet_ok = (now - buf["last_update"]) >= (quiet - 0.5)
            max_ok = (now - buf["started"]) >= maxwin
            if not (quiet_ok or max_ok):
                return  # um bloco mais novo reagendou; o próximo flush cuida
            self._pending.pop(key, None)
            self._alerted_keys.add(key)
            self._alerted_themes[key] = (buf["org_id"], buf.get("theme"))
        await self._send_buffered_alert(key, buf)

    async def _flush_all_pending(self) -> None:
        """Envia todos os assuntos pendentes (chamado ao encerrar a sessão)."""
        async with self._pending_lock:
            items = list(self._pending.items())
            self._pending.clear()
            for k, b in items:
                self._alerted_keys.add(k)
                self._alerted_themes[k] = (b["org_id"], b.get("theme"))
                if b.get("flush_task"):
                    b["flush_task"].cancel()
        for key, buf in items:
            try:
                await self._send_buffered_alert(key, buf)
            except Exception as e:
                logger.error("monitor_job.flush_error", key=key, error=str(e))

    async def _send_buffered_alert(self, key: str, buf: dict) -> None:
        """Cria o alerta agregado, concatena o áudio do assunto e envia."""
        async with AsyncSessionLocal() as db:
            alert_row = Alert(
                session_id=buf["session_id"],
                analysis_id=buf["analysis_id"],
                org_id=buf["org_id"],
                status=AlertStatus.pending,
                dedup_hash=key,
                message_text=buf["message"],
                recipients=buf["recipients"],
            )
            db.add(alert_row)
            await db.flush()
            alert_id = alert_row.id
            await db.commit()

        clip_path = await self._prepare_concat_clip(buf["chunk_paths"], alert_id)
        message = buf["message"]
        if clip_path and clip_path.exists() and settings.PUBLIC_BASE_URL:
            # Link permanente do áudio completo (fallback se o anexo falhar/cortar)
            message += (
                f"\n🎧 *Áudio completo:* "
                f"{settings.PUBLIC_BASE_URL.rstrip('/')}/api/v1/audio/alert/{alert_id}"
            )
        await self._send_alert(alert_id, buf["recipients"], message, clip_path)

        logger.info(
            "monitor_job.alert_triggered",
            org_id=buf["org_id"],
            theme=buf.get("theme"),
            urgency=buf["urgency"],
            chunks=len(buf["chunk_paths"]),
        )

    async def _prepare_concat_clip(
        self, chunk_paths: list, alert_id: str
    ) -> Optional[Path]:
        """Concatena os WAVs do assunto (em ordem) num único OGG Opus."""
        paths = [Path(p) for p in chunk_paths if p and Path(p).exists()]
        if not paths:
            return None
        if len(paths) == 1:
            return await self._prepare_audio_clip(paths[0], alert_id)
        try:
            settings.CLIPS_DIR.mkdir(parents=True, exist_ok=True)
            list_file = settings.CLIPS_DIR / f"concat_{alert_id}.txt"
            with open(list_file, "w") as f:
                for p in paths:
                    f.write(f"file '{p.resolve()}'\n")
            ogg_path = settings.CLIPS_DIR / f"alert_{alert_id}.ogg"
            proc = await asyncio.create_subprocess_exec(
                "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(list_file),
                "-c:a", "libopus", "-b:a", "32k", "-ar", "24000", "-ac", "1",
                str(ogg_path),
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await proc.wait()
            try:
                list_file.unlink(missing_ok=True)
            except Exception:
                pass
            if ogg_path.exists() and ogg_path.stat().st_size > 0:
                return ogg_path
            logger.warning("monitor_job.concat_failed", alert_id=alert_id, n=len(paths))
        except Exception as e:
            logger.error("monitor_job.concat_error", error=str(e))
        # Fallback: manda pelo menos o primeiro bloco
        return await self._prepare_audio_clip(paths[0], alert_id)

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
            # O OGG fica em clips/ como registro permanente do alerta — é o que
            # permite o link "áudio completo" e a auditoria posterior.

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
        # Watchdog: falha de captura nunca pode ser silenciosa
        program = session.program
        station = program.station if program else None
        label = f"{station.name if station else '?'} — {program.name if program else '?'}"
        if "resolver url" in reason.lower():
            hint = (
                "Provável: URL do stream morta ou live/cookies do YouTube vencidos "
                "(ação humana). Diagnóstico: python3 scripts/radio_health.py"
            )
        else:
            hint = "Pode ser instabilidade temporária; se repetir, rode scripts/radio_health.py"
        await notify_admin(
            f"capture_failed:{self.program_id}",
            f"❌ *Captura FALHOU*\n📻 {label}\nMotivo: {reason}\n{hint}",
        )

    async def _finalize(self) -> None:
        # Envia qualquer assunto ainda em buffer antes de fechar e relatar
        await self._flush_all_pending()

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

            # Não envia relatório quando nada foi capturado (0 chunks) — isso
            # indica falha de captura (ex.: stream fora do ar, rate-limit), e
            # um relatório vazio parece defeito para o cliente.
            if session.total_chunks > 0:
                report = await generate_session_report(db, session)
                if report:
                    await self._send_report(session, report)
            else:
                logger.info(
                    "monitor_job.report_skipped_no_audio",
                    session_id=self.session_id,
                )
                # Watchdog: sessão terminou sem capturar NADA — cobertura zerada.
                # Só avisa se a sessão cobriu um período relevante (>= 10 min);
                # sessão retomada no fim da janela com 0 blocos é ruído esperado.
                duration_min = 0.0
                if session.started_at and session.ended_at:
                    duration_min = (session.ended_at - session.started_at).total_seconds() / 60
                if duration_min >= 10:
                    program = session.program
                    station = program.station if program else None
                    label = f"{station.name if station else '?'} — {program.name if program else '?'}"
                    await notify_admin(
                        f"zero_chunks:{self.program_id}",
                        f"⚠️ *Programa terminou com 0 blocos capturados*\n📻 {label}\n"
                        f"Janela monitorada: {duration_min:.0f} min. O stream "
                        f"provavelmente ficou fora do ar.",
                    )

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
