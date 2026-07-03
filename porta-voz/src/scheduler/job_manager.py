"""
Gerenciador de jobs de monitoramento usando APScheduler.
Agenda sessões com base nos horários dos programas cadastrados.
"""
import asyncio
from datetime import datetime, timedelta
from typing import Dict, Optional
import pytz

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select

from src.core.database import AsyncSessionLocal
from src.core.models import Program, MonitoringSession, RadioStation, SessionStatus
from src.core.models import gen_uuid
from src.scheduler.monitor_job import MonitorJob
from src.core.logging_config import get_logger

logger = get_logger(__name__)

_DAY_MAP = {
    "monday": "mon",
    "tuesday": "tue",
    "wednesday": "wed",
    "thursday": "thu",
    "friday": "fri",
    "saturday": "sat",
    "sunday": "sun",
}


class JobManager:
    """
    Gerencia o ciclo de vida dos jobs de monitoramento.
    Um job = um programa de rádio rodando em tempo real.
    """

    def __init__(self):
        self._scheduler = AsyncIOScheduler()
        self._active_jobs: Dict[str, asyncio.Task] = {}    # program_id → Task
        self._active_monitors: Dict[str, "MonitorJob"] = {}  # program_id → MonitorJob

    def start(self) -> None:
        self._scheduler.start()
        logger.info("job_manager.started")

    def stop(self) -> None:
        self._scheduler.shutdown(wait=False)
        for task in self._active_jobs.values():
            task.cancel()
        self._active_monitors.clear()
        logger.info("job_manager.stopped")

    async def load_programs(self) -> None:
        """
        Carrega todos os programas ativos do banco e agenda seus jobs.
        Chamado na inicialização da aplicação.
        """
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Program).where(Program.is_active == True)
            )
            programs = result.scalars().all()

        for program in programs:
            self.schedule_program(program)

        logger.info("job_manager.programs_loaded", count=len(programs))

    async def recover_on_startup(self) -> None:
        """
        Recuperação pós-reinício:
        1. Marca sessões órfãs (running/scheduled de execuções anteriores) como interrupted.
        2. Retoma imediatamente programas cuja janela de horário está em andamento agora.
        Chamado na inicialização, depois de load_programs().
        """
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(MonitoringSession).where(
                    MonitoringSession.status.in_(
                        [SessionStatus.running, SessionStatus.scheduled]
                    )
                )
            )
            stale_sessions = result.scalars().all()
            for s in stale_sessions:
                s.status = SessionStatus.interrupted
                s.ended_at = datetime.utcnow()
                s.error_message = "Sessão interrompida por reinício do serviço"
            if stale_sessions:
                await db.commit()
                logger.info(
                    "job_manager.stale_sessions_closed", count=len(stale_sessions)
                )

            result = await db.execute(
                select(Program).where(Program.is_active == True)
            )
            programs = result.scalars().all()

        weekdays = [
            "monday", "tuesday", "wednesday", "thursday",
            "friday", "saturday", "sunday",
        ]
        for program in programs:
            try:
                tz = pytz.timezone(program.timezone or "America/Sao_Paulo")
                now = datetime.now(tz)
                if weekdays[now.weekday()] not in (program.days_of_week or []):
                    continue
                start_h, start_m = map(int, program.start_time.split(":"))
                end_h, end_m = map(int, program.end_time.split(":"))
                start_dt = now.replace(hour=start_h, minute=start_m, second=0, microsecond=0)
                end_dt = now.replace(hour=end_h, minute=end_m, second=0, microsecond=0)
                if start_dt <= now < end_dt:
                    logger.info(
                        "job_manager.resuming_program",
                        program_id=program.id,
                        program_name=program.name,
                    )
                    await self._start_monitoring(program.id)
            except Exception as e:
                logger.error(
                    "job_manager.resume_error", program_id=program.id, error=str(e)
                )

    def schedule_program(self, program: Program) -> None:
        """Agenda start e stop de um programa com base em seu horário."""
        if not program.days_of_week or not program.start_time or not program.end_time:
            logger.warning("job_manager.skip_incomplete", program_id=program.id)
            return

        days = ",".join(_DAY_MAP[d] for d in program.days_of_week if d in _DAY_MAP)
        if not days:
            return

        tz = program.timezone or "America/Sao_Paulo"
        start_h, start_m = program.start_time.split(":")
        end_h, end_m = program.end_time.split(":")

        start_job_id = f"start_{program.id}"
        stop_job_id = f"stop_{program.id}"

        # Remove jobs anteriores se existirem
        for jid in (start_job_id, stop_job_id):
            if self._scheduler.get_job(jid):
                self._scheduler.remove_job(jid)

        self._scheduler.add_job(
            self._start_monitoring,
            CronTrigger(day_of_week=days, hour=start_h, minute=start_m, timezone=tz),
            id=start_job_id,
            args=[program.id],
            replace_existing=True,
        )

        self._scheduler.add_job(
            self._stop_monitoring,
            CronTrigger(day_of_week=days, hour=end_h, minute=end_m, timezone=tz),
            id=stop_job_id,
            args=[program.id],
            replace_existing=True,
        )

        logger.info(
            "job_manager.program_scheduled",
            program_id=program.id,
            program_name=program.name,
            days=days,
            start=program.start_time,
            end=program.end_time,
            tz=tz,
        )

    def unschedule_program(self, program_id: str) -> None:
        for jid in (f"start_{program_id}", f"stop_{program_id}"):
            if self._scheduler.get_job(jid):
                self._scheduler.remove_job(jid)

    async def start_monitoring_now(self, program_id: str) -> Optional[str]:
        """Inicia monitoramento imediatamente (para testes ou uso manual)."""
        return await self._start_monitoring(program_id)

    async def stop_monitoring_now(self, program_id: str) -> None:
        await self._stop_monitoring(program_id)

    def is_monitoring(self, program_id: str) -> bool:
        task = self._active_jobs.get(program_id)
        return task is not None and not task.done()

    async def get_active_sessions(self) -> list:
        return [
            {"program_id": pid, "running": not task.done()}
            for pid, task in self._active_jobs.items()
        ]

    # ─── Internal ─────────────────────────────────────────────────────────────

    async def _start_monitoring(self, program_id: str) -> Optional[str]:
        if self.is_monitoring(program_id):
            logger.warning("job_manager.already_running", program_id=program_id)
            return None

        async with AsyncSessionLocal() as db:
            program = await db.get(Program, program_id)
            if not program or not program.is_active:
                logger.warning("job_manager.program_not_found", program_id=program_id)
                return None

            session = MonitoringSession(
                id=gen_uuid(),
                program_id=program_id,
                status=SessionStatus.scheduled,
            )
            db.add(session)
            await db.commit()
            session_id = session.id

        job = MonitorJob(program_id=program_id, session_id=session_id)
        task = asyncio.create_task(job.run(), name=f"monitor_{program_id}")
        self._active_jobs[program_id] = task
        self._active_monitors[program_id] = job

        def _cleanup(t):
            self._active_jobs.pop(program_id, None)
            self._active_monitors.pop(program_id, None)
        task.add_done_callback(_cleanup)

        logger.info("job_manager.monitoring_started", program_id=program_id, session_id=session_id)
        return session_id

    async def _stop_monitoring(self, program_id: str) -> None:
        job = self._active_monitors.get(program_id)
        task = self._active_jobs.get(program_id)

        if job:
            await job.stop()  # para captura + ffmpeg + watcher

        if task and not task.done():
            task.cancel()
            try:
                await asyncio.wait_for(asyncio.shield(task), timeout=90.0)
            except (asyncio.CancelledError, asyncio.TimeoutError):
                pass

        self._active_jobs.pop(program_id, None)
        self._active_monitors.pop(program_id, None)
        logger.info("job_manager.monitoring_stopped", program_id=program_id)


# Singleton global
job_manager = JobManager()
