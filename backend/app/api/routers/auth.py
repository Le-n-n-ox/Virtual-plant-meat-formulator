"""Login, logout and current-user routes (guide 6.1). Local auth mode only issues tokens."""

from fastapi import APIRouter, Response
from sqlalchemy import func, select

from app.api.deps import RequestIdDep, SessionDep, SettingsDep, ViewerDep, audit
from app.api.errors import ApiError
from app.core.security import hash_password, issue_local_token, verify_password
from app.db.models import Profile
from app.schemas.auth import LoginRequest, MeResponse, TokenResponse

router = APIRouter(tags=["auth"])

# Verified against when the account does not exist, so response time does not reveal accounts.
_DUMMY_HASH = hash_password("not-a-real-password", iterations=1000)


@router.post("/auth/login")
def login(
    body: LoginRequest,
    session: SessionDep,
    settings: SettingsDep,
    request_id: RequestIdDep,
) -> TokenResponse:
    if settings.auth_mode == "supabase":
        raise ApiError(
            400,
            "bad_request",
            "This deployment uses Supabase Auth; sign in with the Supabase client instead.",
        )
    profile = session.scalars(
        select(Profile).where(func.lower(Profile.email) == body.email.strip().lower())
    ).first()
    ok = verify_password(body.password, profile.password_hash if profile else _DUMMY_HASH)
    if profile is None or not ok or not profile.active:
        raise ApiError(401, "unauthenticated", "Invalid email or password.")
    token, expires_in = issue_local_token(settings, profile.user_id, profile.email)
    audit(
        session,
        actor_id=profile.user_id,
        action="auth.login",
        entity="profile",
        entity_id=profile.user_id,
        request_id=request_id,
    )
    return TokenResponse(access_token=token, expires_in=expires_in)


@router.post("/auth/logout", status_code=204)
def logout(_user: ViewerDep) -> Response:
    """Tokens are stateless; the client discards its token. Kept for contract parity."""
    return Response(status_code=204)


@router.get("/auth/me")
def me(user: ViewerDep) -> MeResponse:
    return MeResponse(
        user_id=user.user_id, email=user.email, display_name=user.display_name, role=user.role
    )
