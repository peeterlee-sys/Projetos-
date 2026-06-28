"""
Envio de alertas via Z-API (WhatsApp Business).
"""
import httpx
from typing import List, Optional

from src.core.config import settings
from src.core.logging_config import get_logger

logger = get_logger(__name__)

_HTTP_TIMEOUT = 20.0


async def send_text(phone: str, message: str) -> bool:
    """
    Envia mensagem de texto via Z-API.

    Args:
        phone: Número no formato 5547999999999 (sem + ou -)
        message: Texto a enviar

    Returns:
        True se enviado com sucesso
    """
    if not settings.ZAPI_INSTANCE_ID or not settings.ZAPI_TOKEN:
        logger.warning("whatsapp.not_configured", phone=phone)
        return False

    headers = {
        "Content-Type": "application/json",
        "Client-Token": settings.ZAPI_CLIENT_TOKEN,
    }

    payload = {
        "phone": phone,
        "message": message,
    }

    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            response = await client.post(
                settings.zapi_send_text_url,
                json=payload,
                headers=headers,
            )

        if response.status_code in (200, 201):
            logger.info("whatsapp.sent", phone=phone[-4:], status=response.status_code)
            return True
        else:
            logger.error(
                "whatsapp.send_failed",
                phone=phone[-4:],
                status=response.status_code,
                body=response.text[:300],
            )
            return False

    except httpx.TimeoutException:
        logger.error("whatsapp.timeout", phone=phone[-4:])
        return False
    except Exception as e:
        logger.error("whatsapp.error", phone=phone[-4:], error=str(e))
        return False


async def send_to_recipients(
    phones: List[str],
    message: str,
    max_retries: int = 2,
) -> dict[str, bool]:
    """
    Envia mensagem para múltiplos destinatários.

    Returns:
        Dict {phone: success}
    """
    results: dict[str, bool] = {}

    for phone in phones:
        phone = phone.strip()
        if not phone:
            continue

        success = False
        for attempt in range(max_retries + 1):
            success = await send_text(phone, message)
            if success:
                break
            if attempt < max_retries:
                import asyncio
                await asyncio.sleep(2 ** attempt)

        results[phone] = success

    sent = sum(1 for v in results.values() if v)
    logger.info(
        "whatsapp.batch_complete",
        total=len(phones),
        sent=sent,
        failed=len(phones) - sent,
    )

    return results


def filter_by_urgency(recipients_with_filter: list, urgency: str) -> List[str]:
    """
    Filtra destinatários que aceitam a urgência informada.

    recipients_with_filter: [{"phone": "...", "urgency_filter": "medium"}, ...]
    Urgências em ordem crescente: low < medium < high < critical
    """
    order = ["low", "medium", "high", "critical"]
    urgency_level = order.index(urgency) if urgency in order else 0

    return [
        r["phone"]
        for r in recipients_with_filter
        if order.index(r.get("urgency_filter", "low")) <= urgency_level
    ]
