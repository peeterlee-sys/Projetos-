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

    # Agrupa por ASSUNTO (tema), unindo o mesmo tema entre rádios diferentes —
    # a janela de contexto gera análises sobrepostas e o mesmo assunto costuma
    # ecoar em várias rádios. Mantemos a hora mais cedo, a maior urgência, o
    # resumo mais limpo e a lista de rádios onde apareceu.
    groups: dict[str, dict] = {}
    for i, (analysis, trans, program, station) in enumerate(rows):
        urg = analysis.urgency.value if analysis.urgency else "low"
        sev = _URG_SEVERITY.get(urg, 0)
        tk = _theme_key(analysis.theme)
        key = tk if tk else f"__{i}"  # sem tema: não funde com nada
        time_str = pytz.utc.localize(trans.chunk_started_at).astimezone(_BRT).strftime("%H:%M")
        # usa o RESUMO (frase limpa do Claude), não o trecho bruto do Whisper
        summary = (analysis.summary or "").strip()
        if len(summary) > 180:
            summary = summary[:177] + "…"

        g = groups.get(key)
        if g is None:
            groups[key] = {
                "time": time_str,
                "theme": analysis.theme or "",
                "urgency": urg,
                "sentiment": analysis.sentiment.value if analysis.sentiment else "neutral",
                "content_type": analysis.content_type.value if analysis.content_type else "other",
                "summary": summary,
                "stations": {station.name},
                "_sev": sev,
                "_sort": trans.chunk_started_at,
            }
        else:
            g["stations"].add(station.name)
            if trans.chunk_started_at < g["_sort"]:
                g["_sort"] = trans.chunk_started_at
                g["time"] = time_str
            if sev > g["_sev"]:
                g["_sev"] = sev
                g["urgency"] = urg
                g["sentiment"] = analysis.sentiment.value if analysis.sentiment else "neutral"
                g["content_type"] = analysis.content_type.value if analysis.content_type else "other"
                if analysis.theme:
                    g["theme"] = analysis.theme
                if summary:
                    g["summary"] = summary
            elif not g["summary"] and summary:
                g["summary"] = summary

    items = sorted(groups.values(), key=lambda x: (-x["_sev"], x["_sort"]))
    for it in items:
        it["stations"] = sorted(it["stations"])
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
