"""
Notificações operacionais para o ADMIN do sistema (watchdog).

Falha de captura, cliente sem destinatário, disco cheio — tudo que é problema
de OPERAÇÃO (não de conteúdo de rádio) chega aqui e vai para o WhatsApp do
administrador. Nunca lança exceção: watchdog não pode derrubar o pipeline.
"""
from datetime import datetime

import pytz

from src.core.config import settings
from src.core.logging_config import get_logger

logger = get_logger(__name__)

_BRT = pytz.timezone("America/Sao_Paulo")

# Anti-flood simples: no máximo 1 aviso idêntico a cada 30 min
_last_sent: dict[str, datetime] = {}
_MIN_INTERVAL_SECONDS = 30 * 60


def _admin_phone() -> str:
    if settings.ADMIN_ALERT_PHONE.strip():
        return settings.ADMIN_ALERT_PHONE.strip()
    recipients = settings.alert_recipients_list
    return recipients[0] if recipients else ""


async def notify_admin(event: str, detail: str) -> bool:
    """
    Envia aviso operacional ao admin. `event` é uma chave curta (dedup/anti-flood),
    `detail` é o texto humano. Retorna True se enviou.
    """
    now = datetime.utcnow()
    last = _last_sent.get(event)
    if last and (now - last).total_seconds() < _MIN_INTERVAL_SECONDS:
        logger.debug("admin_notify.suppressed", event=event)
        return False

    phone = _admin_phone()
    if not phone:
        logger.warning("admin_notify.no_phone", event=event, detail=detail)
        return False

    stamp = now.replace(tzinfo=pytz.utc).astimezone(_BRT).strftime("%d/%m %H:%M")
    message = (
        "🛠️ *RADAR PÚBLICO — AVISO OPERACIONAL*\n\n"
        f"{detail}\n\n"
        f"_{stamp} BRT · evento: {event}_"
    )

    try:
        from src.alerts.whatsapp import send_text
        ok = await send_text(phone, message)
        if ok:
            _last_sent[event] = now
        logger.info("admin_notify.sent", event=event, ok=ok)
        return ok
    except Exception as e:
        logger.error("admin_notify.failed", event=event, error=str(e))
        return False
