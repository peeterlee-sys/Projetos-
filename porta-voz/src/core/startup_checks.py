"""
Checagens de sanidade na inicialização.

Pega erros de configuração que deixam o produto "mudo" sem ninguém perceber —
como um cliente ativo monitorando rádios sem NENHUM destinatário de alerta
(aconteceu com Itapema: dias analisando sem entregar nada).
"""
from sqlalchemy import select

from src.core.database import AsyncSessionLocal
from src.core.models import (
    Organization, AlertRecipient, StationSubscription, RadioStation, Program,
)
from src.core.admin_notify import notify_admin
from src.core.logging_config import get_logger

logger = get_logger(__name__)


async def audit_recipients() -> list[str]:
    """
    Retorna (e avisa o admin sobre) organizações ativas que estão monitorando
    rádio — via rádio própria com programa ativo ou assinatura ativa — mas não
    têm nenhum destinatário de alerta ativo.
    """
    async with AsyncSessionLocal() as db:
        orgs = (await db.execute(
            select(Organization).where(Organization.is_active == True)
        )).scalars().all()

        silent: list[str] = []
        for org in orgs:
            # tem monitoramento?
            has_sub = (await db.execute(
                select(StationSubscription.id).where(
                    StationSubscription.org_id == org.id,
                    StationSubscription.is_active == True,
                ).limit(1)
            )).scalar_one_or_none() is not None

            has_own_program = (await db.execute(
                select(Program.id)
                .join(RadioStation, Program.station_id == RadioStation.id)
                .where(
                    RadioStation.org_id == org.id,
                    RadioStation.is_active == True,
                    Program.is_active == True,
                ).limit(1)
            )).scalar_one_or_none() is not None

            if not (has_sub or has_own_program):
                continue  # org sem monitoramento (ex.: recém-criada) — ok

            has_recipient = (await db.execute(
                select(AlertRecipient.id).where(
                    AlertRecipient.org_id == org.id,
                    AlertRecipient.is_active == True,
                ).limit(1)
            )).scalar_one_or_none() is not None

            if not has_recipient:
                silent.append(org.name)

    if silent:
        logger.warning("startup_check.orgs_without_recipients", orgs=silent)
        await notify_admin(
            "orgs_without_recipients",
            "📵 *Cliente(s) monitorando SEM destinatário de alerta:*\n"
            + "\n".join(f"• {name}" for name in silent)
            + "\n\nAlertas e clipagem desses clientes não chegam a ninguém. "
              "Cadastre um telefone em /organizations/{id}/recipients.",
        )
    else:
        logger.info("startup_check.recipients_ok")

    return silent
