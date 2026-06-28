"""
CRUD de palavras-chave por organização/programa.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.core.models import Keyword
from src.api.schemas import KeywordCreate, KeywordOut, MessageOut

router = APIRouter(prefix="/keywords", tags=["Palavras-chave"])


@router.get("/", response_model=list[KeywordOut])
async def list_keywords(
    org_id: Optional[str] = None,
    program_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(Keyword).where(Keyword.is_active == True)
    if org_id:
        q = q.where(Keyword.org_id == org_id)
    if program_id:
        q = q.where(Keyword.program_id == program_id)
    result = await db.execute(q.order_by(Keyword.term))
    return result.scalars().all()


@router.post("/", response_model=KeywordOut, status_code=status.HTTP_201_CREATED)
async def create_keyword(payload: KeywordCreate, db: AsyncSession = Depends(get_db)):
    keyword = Keyword(**payload.model_dump())
    db.add(keyword)
    await db.commit()
    await db.refresh(keyword)
    return keyword


@router.post("/bulk", response_model=list[KeywordOut], status_code=status.HTTP_201_CREATED)
async def create_keywords_bulk(
    payload: list[KeywordCreate],
    db: AsyncSession = Depends(get_db),
):
    keywords = [Keyword(**kw.model_dump()) for kw in payload]
    db.add_all(keywords)
    await db.commit()
    for kw in keywords:
        await db.refresh(kw)
    return keywords


@router.delete("/{keyword_id}", response_model=MessageOut)
async def delete_keyword(keyword_id: str, db: AsyncSession = Depends(get_db)):
    keyword = await db.get(Keyword, keyword_id)
    if not keyword:
        raise HTTPException(status_code=404, detail="Palavra-chave não encontrada")

    keyword.is_active = False
    await db.commit()
    return MessageOut(message="Palavra-chave desativada")
