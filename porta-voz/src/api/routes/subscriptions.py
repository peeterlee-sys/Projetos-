"""
Rotas para gerenciar assinaturas de rádio por múltiplos clientes.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.core.models import StationSubscription
from src.api.schemas import SubscriptionCreate, SubscriptionOut

router = APIRouter(prefix="/subscriptions", tags=["Subscriptions"])


@router.post("/", response_model=SubscriptionOut, status_code=201)
async def create_subscription(data: SubscriptionCreate, db: AsyncSession = Depends(get_db)):
    """Assina uma rádio para um cliente. Permite múltiplos clientes na mesma rádio."""
    existing = await db.execute(
        select(StationSubscription).where(
            StationSubscription.station_id == data.station_id,
            StationSubscription.org_id == data.org_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Assinatura já existe para este cliente e rádio")

    sub = StationSubscription(
        station_id=data.station_id,
        org_id=data.org_id,
        city_filter=data.city_filter,
        is_active=True,
    )
    db.add(sub)
    await db.flush()
    return sub


@router.get("/", response_model=list[SubscriptionOut])
async def list_subscriptions(
    station_id: str | None = None,
    org_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Lista assinaturas, opcionalmente filtradas por rádio ou cliente."""
    query = select(StationSubscription).where(StationSubscription.is_active == True)
    if station_id:
        query = query.where(StationSubscription.station_id == station_id)
    if org_id:
        query = query.where(StationSubscription.org_id == org_id)
    result = await db.execute(query)
    return result.scalars().all()


@router.delete("/{subscription_id}", status_code=204)
async def delete_subscription(subscription_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(StationSubscription).where(StationSubscription.id == subscription_id)
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Assinatura não encontrada")
    sub.is_active = False
    return None
