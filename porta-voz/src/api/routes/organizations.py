"""
CRUD de organizações (prefeituras/clientes) e destinatários de alertas.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.core.models import Organization, AlertRecipient
from src.api.schemas import OrganizationCreate, OrganizationUpdate, OrganizationOut, RecipientCreate, RecipientOut, MessageOut
from src.api.routes.auth import require_admin

router = APIRouter(prefix="/organizations", tags=["Organizações"])


@router.get("/", response_model=list[OrganizationOut])
async def list_organizations(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Organization).order_by(Organization.name))
    return result.scalars().all()


@router.post("/", response_model=OrganizationOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
async def create_organization(payload: OrganizationCreate, db: AsyncSession = Depends(get_db)):
    org = Organization(**payload.model_dump())
    db.add(org)
    await db.commit()
    await db.refresh(org)
    return org


@router.get("/{org_id}", response_model=OrganizationOut)
async def get_organization(org_id: str, db: AsyncSession = Depends(get_db)):
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organização não encontrada")
    return org


@router.patch("/{org_id}", response_model=OrganizationOut, dependencies=[Depends(require_admin)])
async def update_organization(
    org_id: str,
    payload: OrganizationUpdate,
    db: AsyncSession = Depends(get_db),
):
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organização não encontrada")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(org, field, value)

    await db.commit()
    await db.refresh(org)
    return org


# ─── Destinatários de alertas ─────────────────────────────────────────────────

@router.get("/{org_id}/recipients", response_model=list[RecipientOut])
async def list_recipients(org_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AlertRecipient).where(
            AlertRecipient.org_id == org_id,
            AlertRecipient.is_active == True,
        )
    )
    return result.scalars().all()


@router.post("/{org_id}/recipients", response_model=RecipientOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
async def create_recipient(
    org_id: str,
    payload: RecipientCreate,
    db: AsyncSession = Depends(get_db),
):
    payload_dict = payload.model_dump()
    payload_dict["org_id"] = org_id
    recipient = AlertRecipient(**payload_dict)
    db.add(recipient)
    await db.commit()
    await db.refresh(recipient)
    return recipient


@router.delete("/{org_id}/recipients/{recipient_id}", response_model=MessageOut, dependencies=[Depends(require_admin)])
async def delete_recipient(
    org_id: str,
    recipient_id: str,
    db: AsyncSession = Depends(get_db),
):
    recipient = await db.get(AlertRecipient, recipient_id)
    if not recipient or recipient.org_id != org_id:
        raise HTTPException(status_code=404, detail="Destinatário não encontrado")

    recipient.is_active = False
    await db.commit()
    return MessageOut(message="Destinatário desativado com sucesso")
