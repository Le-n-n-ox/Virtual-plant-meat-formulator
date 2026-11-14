"""Password hashing, local JWTs, Supabase JWT verification and SSE stream tokens."""

import base64
import hashlib
import hmac
import json
import os
import time
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import jwt

from app.config import Settings

ROLES = ("viewer", "scientist", "curator", "admin")
ROLE_RANK = {role: index for index, role in enumerate(ROLES)}


class TokenError(Exception):
    """Raised when a bearer or stream token is missing, invalid or expired."""


# --------------------------------------------------------------------------- passwords


def hash_password(password: str, *, iterations: int = 260_000) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str | None) -> bool:
    if not encoded:
        return False
    try:
        _algo, iterations, salt_hex, digest_hex = encoded.split("$")
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt_hex), int(iterations)
        )
    except ValueError, TypeError:
        return False
    return hmac.compare_digest(digest.hex(), digest_hex)


# --------------------------------------------------------------------------- access tokens


def issue_local_token(settings: Settings, user_id: str, email: str) -> tuple[str, int]:
    now = int(time.time())
    ttl = settings.local_jwt_ttl_seconds
    payload = {
        "sub": user_id,
        "email": email,
        "aud": settings.local_jwt_audience,
        "iat": now,
        "exp": now + ttl,
        "iss": "vpmf-local",
    }
    return jwt.encode(payload, settings.local_jwt_secret, algorithm="HS256"), ttl


@lru_cache(maxsize=4)
def _jwks_client(url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(url, cache_keys=True, lifespan=3600)


def verify_access_token(settings: Settings, token: str) -> dict[str, Any]:
    """Verify signature, expiry and audience; return the claims."""
    try:
        if settings.auth_mode == "local":
            return jwt.decode(
                token,
                settings.local_jwt_secret,
                algorithms=["HS256"],
                audience=settings.local_jwt_audience,
                options={"require": ["exp", "sub", "aud"]},
            )
        if not settings.supabase_url:
            raise TokenError("Supabase authentication is not configured.")
        header = jwt.get_unverified_header(token)
        if header.get("alg") == "HS256":
            if not settings.supabase_jwt_secret:
                raise TokenError("HS256 Supabase tokens need SUPABASE_JWT_SECRET.")
            key: Any = settings.supabase_jwt_secret
            algorithms = ["HS256"]
        else:
            jwks_url = settings.supabase_url.rstrip("/") + "/auth/v1/.well-known/jwks.json"
            key = _jwks_client(jwks_url).get_signing_key_from_jwt(token).key
            algorithms = ["RS256", "ES256"]
        return jwt.decode(
            token,
            key,
            algorithms=algorithms,
            audience=settings.supabase_jwt_audience,
            options={"require": ["exp", "sub", "aud"]},
        )
    except jwt.PyJWTError as exc:
        raise TokenError(str(exc)) from exc


# --------------------------------------------------------------------------- stream tokens


@dataclass(frozen=True)
class StreamClaims:
    job_id: str
    user_id: str
    expires_at: int
    nonce: str


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def issue_stream_token(settings: Settings, job_id: str, user_id: str) -> tuple[str, int]:
    """HMAC-signed token bound to one job and one user. Signed with a secret distinct
    from any JWT secret."""
    expires_at = int(time.time()) + settings.stream_token_ttl_seconds
    body = json.dumps(
        {"j": job_id, "u": user_id, "e": expires_at, "n": os.urandom(8).hex()},
        separators=(",", ":"),
    ).encode()
    signature = hmac.new(settings.stream_token_secret.encode(), body, hashlib.sha256).digest()
    return f"{_b64(body)}.{_b64(signature)}", expires_at


def verify_stream_token(settings: Settings, token: str, job_id: str) -> StreamClaims:
    try:
        body_part, sig_part = token.split(".", 1)
        body = _unb64(body_part)
        expected = hmac.new(settings.stream_token_secret.encode(), body, hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _unb64(sig_part)):
            raise TokenError("Invalid stream token signature.")
        data = json.loads(body)
    except (ValueError, json.JSONDecodeError) as exc:
        raise TokenError("Malformed stream token.") from exc
    if data.get("j") != job_id:
        raise TokenError("Stream token is for a different job.")
    if int(data.get("e", 0)) < int(time.time()):
        raise TokenError("Stream token expired.")
    return StreamClaims(job_id=data["j"], user_id=data["u"], expires_at=data["e"], nonce=data["n"])


class _NonceStore:
    """Single-use enforcement for stream tokens (per process; tokens live ~60 s)."""

    def __init__(self) -> None:
        self._seen: dict[str, int] = {}

    def consume(self, nonce: str, expires_at: int) -> bool:
        now = int(time.time())
        self._seen = {k: v for k, v in self._seen.items() if v >= now}
        if nonce in self._seen:
            return False
        self._seen[nonce] = expires_at
        return True


stream_nonces = _NonceStore()
