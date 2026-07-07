"""
Autenticação da plataforma do cliente: login por e-mail/senha e emissão de
token de sessão assinado. Protege endpoints por organização.
Também define require_admin: proteção por token dos endpoints administrativos.
"""
import hmac
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import settings
from src.core.database import get_db
from src.core.models import User, Organization
from src.core.security import verify_password, create_token, verify_token
from src.core.logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/auth", tags=["Autenticação"])


class LoginIn(BaseModel):
    email: str
    password: str


class LoginOut(BaseModel):
    token: str
    org_id: str
    org_name: Optional[str] = None
    user_name: Optional[str] = None


@router.post("/login", response_model=LoginOut)
async def login(payload: LoginIn, db: AsyncSession = Depends(get_db)):
    email = (payload.email or "").strip().lower()
    result = await db.execute(select(User).where(func.lower(User.email) == email))
    user = result.scalar_one_or_none()

    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        # Mensagem genérica — não revela se o e-mail existe.
        raise HTTPException(status_code=401, detail="E-mail ou senha inválidos")

    user.last_login = datetime.utcnow()
    await db.commit()

    org = await db.get(Organization, user.org_id)
    token = create_token(user_id=user.id, org_id=user.org_id)
    logger.info("auth.login_success", user_id=user.id, org_id=user.org_id)
    return LoginOut(
        token=token,
        org_id=user.org_id,
        org_name=org.name if org else None,
        user_name=user.name,
    )


# ─── Dependency de autorização ──────────────────────────────────────────────

async def require_admin(x_admin_token: str = Header(default="")) -> None:
    """
    Protege endpoints ADMINISTRATIVOS (criar/alterar/apagar clientes, rádios,
    keywords etc.). Exige o header 'X-Admin-Token' igual ao API_SECRET_KEY.
    Scripts internos leem a chave do .env e enviam o header.
    """
    expected = settings.API_SECRET_KEY or ""
    if not expected or expected == "dev-secret-change-in-production":
        # Sem chave forte configurada, nega tudo — falhar fechado.
        raise HTTPException(status_code=503, detail="API_SECRET_KEY não configurada no servidor")
    if not hmac.compare_digest(x_admin_token, expected):
        raise HTTPException(status_code=401, detail="Token administrativo inválido")

async def get_current_user(
    authorization: Optional[str] = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Valida o token 'Authorization: Bearer <token>' e retorna o usuário."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Não autenticado")
    token = authorization.split(" ", 1)[1].strip()
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Sessão expirada ou inválida")
    user = await db.get(User, payload.get("uid"))
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Usuário inválido")
    return user


@router.get("/me", response_model=LoginOut)
async def me(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org = await db.get(Organization, user.org_id)
    # Reemite um token fresco (renova a validade a cada checagem)
    token = create_token(user_id=user.id, org_id=user.org_id)
    return LoginOut(token=token, org_id=user.org_id, org_name=org.name if org else None, user_name=user.name)
