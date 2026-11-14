"""FastAPI dependency providers: settings, database session, current user and roles."""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import Depends, Header, Query, Request
from sqlalchemy.orm import Session

from app.api.errors import ApiError
from app.config import Settings, get_settings
from app.core.security import ROLE_RANK, TokenError, verify_access_token
from app.db.models import AuditLog, Profile
from app.db.session import get_session

SessionDep = Annotated[Session, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


@dataclass(frozen=True)
class CurrentUser:
    user_id: str
    email: str
    display_name: str
    role: str

    def has_role(self, minimum: str) -> bool:
        return ROLE_RANK.get(self.role, -1) >= ROLE_RANK[minimum]


def _bearer(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise ApiError(401, "unauthenticated", "Missing bearer token.")
    return authorization.split(" ", 1)[1].strip()


def get_current_user(
    session: SessionDep,
    settings: SettingsDep,
    authorization: Annotated[str | None, Header()] = None,
) -> CurrentUser:
    """Verify the JWT (signature, expiry, audience) and load the user's profile."""
    token = _bearer(authorization)
    try:
        claims = verify_access_token(settings, token)
    except TokenError as exc:
        raise ApiError(401, "unauthenticated", "Invalid or expired token.") from exc
    user_id = str(claims["sub"])
    profile = session.get(Profile, user_id)
    if profile is None:
        if settings.auth_mode != "supabase":
            raise ApiError(401, "unauthenticated", "Unknown user.")
        # First sign-in through Supabase: create a viewer profile; an admin grants roles.
        email = str(claims.get("email") or f"{user_id}@unknown")
        profile = Profile(
            user_id=user_id, email=email, display_name=email.split("@")[0], role="viewer"
        )
        session.add(profile)
        session.flush()
    if not profile.active:
        raise ApiError(403, "forbidden", "This account is disabled.")
    return CurrentUser(
        user_id=profile.user_id,
        email=profile.email,
        display_name=profile.display_name,
        role=profile.role,
    )


CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]


def require_role(minimum: str) -> Callable[..., CurrentUser]:
    """Dependency factory enforcing the role matrix in guide section 5."""

    def dependency(user: CurrentUserDep) -> CurrentUser:
        if not user.has_role(minimum):
            raise ApiError(
                403, "forbidden", f"This action requires the {minimum} role.", {"role": user.role}
            )
        return user

    return dependency


ViewerDep = Annotated[CurrentUser, Depends(require_role("viewer"))]
ScientistDep = Annotated[CurrentUser, Depends(require_role("scientist"))]
CuratorDep = Annotated[CurrentUser, Depends(require_role("curator"))]
AdminDep = Annotated[CurrentUser, Depends(require_role("admin"))]


@dataclass(frozen=True)
class Paging:
    page: int
    page_size: int

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size

    def envelope(self, items: list[Any], total: int) -> dict[str, Any]:
        return {"items": items, "total": total, "page": self.page, "page_size": self.page_size}


def get_paging(
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> Paging:
    return Paging(page=page, page_size=page_size)


PagingDep = Annotated[Paging, Depends(get_paging)]


def request_id(request: Request) -> str:
    return str(getattr(request.state, "request_id", "req_unknown"))


RequestIdDep = Annotated[str, Depends(request_id)]


def audit(
    session: Session,
    *,
    actor_id: str | None,
    action: str,
    entity: str,
    entity_id: str | None,
    payload: dict[str, Any] | None = None,
    request_id: str | None = None,
) -> None:
    """Append an audit-trail row (imports, saves, job starts, approvals, exports)."""
    session.add(
        AuditLog(
            actor_id=actor_id,
            action=action,
            entity=entity,
            entity_id=entity_id,
            payload=payload or {},
            request_id=request_id,
        )
    )
