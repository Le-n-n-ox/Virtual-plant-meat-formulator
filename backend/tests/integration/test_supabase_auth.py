"""Supabase-mode JWT verification: signature, expiry, audience and algorithm handling.

Uses a locally generated RSA key pair in place of the project's published signing keys.
"""

import time
from types import SimpleNamespace

import jwt
import pytest
from app.config import get_settings
from app.core import security
from app.db.models import Profile
from cryptography.hazmat.primitives.asymmetric import rsa

AUDIENCE = "authenticated"
HS_SECRET = "legacy-hs256-secret-for-tests-only-0123456789"


@pytest.fixture(scope="module")
def keys():  # type: ignore[no-untyped-def]
    return (
        rsa.generate_private_key(public_exponent=65537, key_size=2048),
        rsa.generate_private_key(public_exponent=65537, key_size=2048),
    )


@pytest.fixture()
def supabase_env(monkeypatch, keys):  # type: ignore[no-untyped-def]
    """Switch the app to Supabase auth and serve our public key as the project's JWKS."""
    monkeypatch.setenv("AUTH_MODE", "supabase")
    monkeypatch.setenv("SUPABASE_URL", "https://project.supabase.test")
    monkeypatch.setenv("SUPABASE_JWT_AUDIENCE", AUDIENCE)
    monkeypatch.setenv("SUPABASE_JWT_SECRET", HS_SECRET)
    requested: list[str] = []

    def fake_jwks_client(url: str):  # type: ignore[no-untyped-def]
        requested.append(url)
        return SimpleNamespace(
            get_signing_key_from_jwt=lambda _token: SimpleNamespace(key=keys[0].public_key())
        )

    monkeypatch.setattr(security, "_jwks_client", fake_jwks_client)
    get_settings.cache_clear()
    yield requested
    get_settings.cache_clear()


def _token(key, *, alg="RS256", sub="sb-user-1", aud=AUDIENCE, exp_in=600, **extra):  # type: ignore[no-untyped-def]
    claims = {
        "sub": sub,
        "aud": aud,
        "exp": int(time.time()) + exp_in,
        "email": "new.user@example.test",
        **extra,
    }
    for name in [k for k, v in claims.items() if v is None]:
        del claims[name]
    return jwt.encode(claims, key, algorithm=alg)


def _me(client, token):  # type: ignore[no-untyped-def]
    return client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})


def test_valid_token_creates_viewer_profile_on_first_sign_in(  # type: ignore[no-untyped-def]
    supabase_env, client, db, keys
):
    resp = _me(client, _token(keys[0]))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body == {
        "user_id": "sb-user-1",
        "email": "new.user@example.test",
        "display_name": "new.user",
        "role": "viewer",
    }
    assert db.get(Profile, "sb-user-1").role == "viewer"  # least privilege by default
    assert supabase_env == ["https://project.supabase.test/auth/v1/.well-known/jwks.json"]
    # A viewer cannot create formulations until an admin grants a role.
    denied = client.post(
        "/api/formulations",
        json={"name": "x"},
        headers={"Authorization": f"Bearer {_token(keys[0])}"},
    )
    assert denied.status_code == 403


def test_existing_profile_role_is_used(supabase_env, client, db, keys):  # type: ignore[no-untyped-def]
    db.add(
        Profile(user_id="sb-sci", email="sci@example.test", display_name="Sci", role="scientist")
    )
    db.commit()
    assert _me(client, _token(keys[0], sub="sb-sci")).json()["role"] == "scientist"


@pytest.mark.parametrize(
    "kwargs",
    [
        {"aud": "some-other-service"},  # token minted for a different audience
        {"exp_in": -30},  # expired
        {"aud": None},  # audience claim missing
        {"sub": None},  # subject claim missing
    ],
)
def test_bad_claims_are_rejected(supabase_env, client, keys, kwargs):  # type: ignore[no-untyped-def]
    resp = _me(client, _token(keys[0], **kwargs))
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "unauthenticated"


def test_token_signed_by_another_key_is_rejected(supabase_env, client, keys):  # type: ignore[no-untyped-def]
    assert _me(client, _token(keys[1])).status_code == 401


def test_unsigned_and_malformed_tokens_are_rejected(supabase_env, client, db):  # type: ignore[no-untyped-def]
    unsigned = jwt.encode(
        {"sub": "attacker", "aud": AUDIENCE, "exp": int(time.time()) + 600},
        key="",
        algorithm="none",
    )
    assert _me(client, unsigned).status_code == 401
    assert _me(client, "not-a-jwt").status_code == 401
    assert client.get("/api/auth/me").status_code == 401
    assert db.get(Profile, "attacker") is None  # nothing was provisioned


def test_legacy_hs256_tokens_need_the_configured_secret(supabase_env, client, monkeypatch):  # type: ignore[no-untyped-def]
    assert _me(client, _token(HS_SECRET, alg="HS256", sub="sb-hs")).status_code == 200
    assert (
        _me(client, _token("wrong-secret-wrong-secret-wrong-secret-00", alg="HS256")).status_code
        == 401
    )
    # Without a configured secret, HS256 tokens are refused outright.
    monkeypatch.delenv("SUPABASE_JWT_SECRET")
    get_settings.cache_clear()
    assert _me(client, _token(HS_SECRET, alg="HS256")).status_code == 401


def test_local_login_is_disabled_in_supabase_mode(supabase_env, client):  # type: ignore[no-untyped-def]
    resp = client.post("/api/auth/login", json={"email": "a@b.test", "password": "whatever-123"})
    assert resp.status_code == 400 and resp.json()["error"]["code"] == "bad_request"


def test_local_tokens_do_not_work_in_supabase_mode(supabase_env, client, users):  # type: ignore[no-untyped-def]
    local, _ = security.issue_local_token(get_settings(), "usr_admin", "admin@example.test")
    assert _me(client, local).status_code == 401  # wrong audience and wrong key
