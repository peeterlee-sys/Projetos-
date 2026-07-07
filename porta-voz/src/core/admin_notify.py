"""
Notificações operacionais para o ADMIN do sistema (watchdog).

Falha de captura, cliente sem destinatário, disco cheio — tudo que é problema
de OPERAÇÃO (não de conteúdo de rádio) chega aqui e vai para o WhatsApp do
administrador. Nunca lança exceção: watchdog não pode derrubar o pipeline.

Anti-flood em duas camadas, PERSISTIDO em disco (sobrevive a restarts):
  - por evento: no máximo 1 aviso do mesmo evento a cada 30 min;
  - global: no mínimo 90s entre quaisquer dois avisos (rajada de deploy vira
    no máximo 1 mensagem a cada 1min30 em vez de metralhadora).
"""
import json
from datetime import datetime
from pathlib import Path

import pytz

from src.core.config import settings
from src.core.logging_config import get_logger

logger = get_logger(__name__)

_BRT = pytz.timezone("America/Sao_Paulo")

_MIN_INTERVAL_SECONDS = 30 * 60   # mesmo evento
_GLOBAL_MIN_SECONDS = 90          # entre quaisquer eventos
_GLOBAL_KEY = "__last_any__"


def _state_file() -> Path:
    return Path(settings.LOGS_DIR) / "admin_notify_state.json"


def _load_state() -> dict:
    try:
        return json.loads(_state_file().read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save_state(state: dict) -> None:
    try:
        _state_file().parent.mkdir(parents=True, exist_ok=True)
        _state_file().write_text(json.dumps(state), encoding="utf-8")
    except Exception as e:
        logger.warning("admin_notify.state_save_failed", error=str(e))


def _admin_phone() -> str:
    if settings.ADMIN_ALERT_PHONE.strip():
        return settings.ADMIN_ALERT_PHONE.strip()
    recipients = settings.alert_recipients_list
    return recipients[0] if recipients else ""


def _seconds_since(state: dict, key: str, now: datetime) -> float:
    ts = state.get(key)
    if not ts:
        return float("inf")
    try:
        return (now - datetime.fromisoformat(ts)).total_seconds()
    except Exception:
        return float("inf")


async def notify_admin(event: str, detail: str) -> bool:
    """
    Envia aviso operacional ao admin. `event` é uma chave curta (dedup/anti-flood),
    `detail` é o texto humano. Retorna True se enviou.
    """
    now = datetime.utcnow()
    state = _load_state()

    if _seconds_since(state, event, now) < _MIN_INTERVAL_SECONDS:
        logger.debug("admin_notify.suppressed_event", evt=event)
        return False
    if _seconds_since(state, _GLOBAL_KEY, now) < _GLOBAL_MIN_SECONDS:
        logger.info("admin_notify.suppressed_global", evt=event)
        return False

    phone = _admin_phone()
    if not phone:
        logger.warning("admin_notify.no_phone", evt=event, detail=detail)
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
            state[event] = now.isoformat()
            state[_GLOBAL_KEY] = now.isoformat()
            _save_state(state)
        logger.info("admin_notify.sent", evt=event, ok=ok)
        return ok
    except Exception as e:
        logger.error("admin_notify.failed", evt=event, error=str(e))
        return False
