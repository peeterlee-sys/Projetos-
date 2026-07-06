"""
Clipagem diária — resumo com TODA menção relevante captada no dia, por
organização (estilo clipping tradicional), enviado via WhatsApp.

Diferente do alerta (que dispara só urgência alta/crítica em tempo real), a
clipagem cataloga tudo que foi relevante no dia — inclusive baixa/média
urgência — para a equipe nunca sentir que algo "escapou".
"""
import re
import unicodedata
from datetime import datetime, date, timedelta
from typing import Optional

import pytz
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import AsyncSessionLocal
from src.core.models import (
    Analysis, Transcription, MonitoringSession, Program, RadioStation,
    Organization, AlertRecipient, StationSubscription,
)
from src.core.config import settings
from src.alerts.formatter import format_clipping_message
from src.alerts.whatsapp import send_to_recipients
from src.core.logging_config import get_logger

logger = get_logger(__name__)

_BRT = pytz.timezone("America/Sao_Paulo")
_URG_SEVERITY = {"low": 0, "medium": 1, "high": 2, "critical": 3}


def _brt_day_bounds_utc(target_date: date) -> tuple[datetime, datetime]:
    """Retorna [início, fim) do dia BRT convertido para UTC naive (como no banco)."""
    start_brt = _BRT.localize(datetime(target_date.year, target_date.month, target_date.day))
    end_brt = start_brt + timedelta(days=1)
    return (
        start_brt.astimezone(pytz.utc).replace(tzinfo=None),
        end_brt.astimezone(pytz.utc).replace(tzinfo=None),
    )


def _theme_key(theme: Optional[str]) -> str:
    t = unicodedata.normalize("NFKD", theme or "").encode("ascii", "ignore").decode("ascii")
    t = re.sub(r"[^a-z0-9\s]", " ", t.lower())
    return " ".join(t.split()[:4])


async def build_clipping_items(
    db: AsyncSession, org_id: str, target_date: date
) -> list[dict]:
    """Coleta e agrupa as menções relevantes do dia para uma org."""
    start_utc, end_utc = _brt_day_bounds_utc(target_date)

    result = await db.execute(
        select(Analysis, Transcription, Program, RadioStation)
        .join(Transcription, Analysis.transcription_id == Transcription.id)
        .join(MonitoringSession, Transcription.session_id == MonitoringSession.id)
        .join(Program, MonitoringSession.program_id == Program.id)
        .join(RadioStation, Program.station_id == RadioStation.id)
        .where(
            Analysis.org_id == org_id,
            Analysis.is_relevant == True,
            Transcription.chunk_started_at >= start_utc,
            Transcription.chunk_started_at < end_utc,
        )
        .order_by(Transcription.chunk_started_at)
    )
    rows = result.all()

    # city_filter por rádio (assinatura desta org)
    sub_result = await db.execute(
        select(StationSubscription.station_id, StationSubscription.city_filter)
        .where(StationSubscription.org_id == org_id)
    )
    city_by_station = {sid: city for sid, city in sub_result.all()}

    # Agrupa por (rádio + tema) — a janela de contexto gera análises sobrepostas
    # do mesmo assunto; mantemos a de maior urgência, hora mais cedo e trecho mais longo.
    groups: dict[tuple, dict] = {}
    for analysis, trans, program, station in rows:
        urg = analysis.urgency.value if analysis.urgency else "low"
        key = (station.id, _theme_key(analysis.theme))
        time_str = pytz.utc.localize(trans.chunk_started_at).astimezone(_BRT).strftime("%H:%M")
        excerpt = (analysis.excerpt or analysis.summary or "").strip()
        if len(excerpt) > 220:
            excerpt = excerpt[:217] + "…"

        item = {
            "time": time_str,
            "station": station.name,
            "program": program.name,
            "city": city_by_station.get(station.id),
            "theme": analysis.theme or "",
            "urgency": urg,
            "sentiment": analysis.sentiment.value if analysis.sentiment else "neutral",
            "content_type": analysis.content_type.value if analysis.content_type else "other",
            "excerpt": excerpt,
            "_sev": _URG_SEVERITY.get(urg, 0),
            "_sort": trans.chunk_started_at,
        }
        prev = groups.get(key)
        if prev is None:
            groups[key] = item
        else:
            # mantém a hora mais cedo; promove urgência/trecho quando o novo é mais forte
            if item["_sort"] < prev["_sort"]:
                prev["time"] = item["time"]
                prev["_sort"] = item["_sort"]
            if item["_sev"] > prev["_sev"]:
                prev["urgency"] = item["urgency"]
                prev["_sev"] = item["_sev"]
                prev["sentiment"] = item["sentiment"]
                prev["content_type"] = item["content_type"]
                if item.get("theme"):
                    prev["theme"] = item["theme"]
            if len(item["excerpt"]) > len(prev["excerpt"]):
                prev["excerpt"] = item["excerpt"]

    items = sorted(groups.values(), key=lambda x: x["_sort"])
    for it in items:
        it.pop("_sev", None)
        it.pop("_sort", None)
    return items


async def _org_phones(db: AsyncSession, org_id: str) -> list[str]:
    res = await db.execute(
        select(AlertRecipient).where(
            AlertRecipient.org_id == org_id,
            AlertRecipient.is_active == True,
        )
    )
    phones = [r.phone for r in res.scalars().all()]
    return phones or settings.alert_recipients_list


async def generate_and_send_daily_clipping(
    org_id: str,
    target_date: Optional[date] = None,
    send: bool = True,
) -> dict:
    """
    Gera (e opcionalmente envia) a clipagem diária de uma organização.
    Retorna resumo com contagem e status de envio.
    """
    if target_date is None:
        target_date = datetime.utcnow().replace(tzinfo=pytz.utc).astimezone(_BRT).date()

    async with AsyncSessionLocal() as db:
        org = await db.get(Organization, org_id)
        if not org:
            return {"error": "org_not_found", "org_id": org_id}

        items = await build_clipping_items(db, org_id, target_date)
        date_str = target_date.strftime("%d/%m/%Y")
        messages = format_clipping_message(org.name, date_str, items)
        phones = await _org_phones(db, org_id) if send else []

    sent_ok = 0
    if send and phones and items:
        for msg in messages:
            results = await send_to_recipients(phones, msg)
            sent_ok += sum(1 for v in results.values() if v)

    logger.info(
        "clipping.generated",
        org_id=org_id, org=org.name, date=date_str,
        items=len(items), messages=len(messages),
        phones=len(phones), sent=sent_ok, delivered=bool(send and items),
    )

    return {
        "org_id": org_id,
        "org": org.name,
        "date": date_str,
        "item_count": len(items),
        "message_count": len(messages),
        "recipients": len(phones),
        "sent": send and bool(items),
        "preview": messages[0] if messages else "",
    }


async def run_daily_clipping_all(target_date: Optional[date] = None) -> None:
    """Envia a clipagem diária para todas as organizações ativas. Chamado pelo scheduler."""
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(Organization.id).where(Organization.is_active == True))
        org_ids = [row[0] for row in res.all()]

    logger.info("clipping.run_all_start", orgs=len(org_ids))
    for org_id in org_ids:
        try:
            await generate_and_send_daily_clipping(org_id, target_date=target_date, send=True)
        except Exception as e:
            logger.error("clipping.org_failed", org_id=org_id, error=str(e))
