"""
Segurança: hash de senha (PBKDF2-HMAC-SHA256) e tokens de sessão assinados
(HMAC-SHA256). Usa apenas a biblioteca padrão — sem dependências externas.
"""
import base64
import hashlib
import hmac
import json
import os
import time
from typing import Optional

from src.core.config import settings

# ─── Senhas ─────────────────────────────────────────────────────────────────

_PBKDF2_ITERATIONS = 260_000
_ALGO = "pbkdf2_sha256"


def hash_password(password: str) -> str:
    """Gera hash no formato pbkdf2_sha256$iterations$salt_b64$hash_b64."""
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PBKDF2_ITERATIONS)
    return "{}${}${}${}".format(
        _ALGO,
        _PBKDF2_ITERATIONS,
        base64.b64encode(salt).decode("ascii"),
        base64.b64encode(dk).decode("ascii"),
    )


def verify_password(password: str, stored: str) -> bool:
    """Confere a senha contra o hash armazenado (comparação em tempo constante)."""
    try:
        algo, iters, salt_b64, hash_b64 = stored.split("$")
        if algo != _ALGO:
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(hash_b64)
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(iters))
        return hmac.compare_digest(dk, expected)
    except Exception:
        return False


# ─── Tokens de sessão ───────────────────────────────────────────────────────

_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7  # 7 dias


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def _sign(payload_b64: str) -> str:
    sig = hmac.new(
        settings.API_SECRET_KEY.encode("utf-8"),
        payload_b64.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return _b64url(sig)


def create_token(user_id: str, org_id: str, ttl: int = _TOKEN_TTL_SECONDS) -> str:
    payload = {"uid": user_id, "oid": org_id, "exp": int(time.time()) + ttl}
    payload_b64 = _b64url(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    return f"{payload_b64}.{_sign(payload_b64)}"


def verify_token(token: str) -> Optional[dict]:
    """Retorna o payload {uid, oid, exp} se o token for válido e não expirado."""
    try:
        payload_b64, sig = token.split(".")
        if not hmac.compare_digest(sig, _sign(payload_b64)):
            return None
        payload = json.loads(_b64url_decode(payload_b64))
        if int(payload.get("exp", 0)) < int(time.time()):
            return None
        return payload
    except Exception:
        return None
