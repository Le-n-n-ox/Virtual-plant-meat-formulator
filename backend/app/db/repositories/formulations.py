"""Formulation persistence: ownership checks, immutable versions and payload shaping."""

import hashlib
import json
from collections.abc import Sequence
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser
from app.api.errors import ApiError
from app.core.ids import iso, new_id
from app.db.models import Formulation, FormulationVersion, Job, Profile
from app.db.repositories.ingredients import load_ingredient_data
from app.domain.types import Line
from app.schemas.formulations import LineIn

_LIKE_ESCAPE = "\\"


def get_owned_formulation(
    session: Session, formulation_id: str, user: CurrentUser, *, lock: bool = False
) -> Formulation:
    """Return the formulation if ``user`` owns it; 404 otherwise (never reveal others' records)."""
    stmt = select(Formulation).where(
        Formulation.id == formulation_id, Formulation.owner_id == user.user_id
    )
    if lock:
        stmt = stmt.with_for_update()
    row = session.scalars(stmt).first()
    if row is None:
        raise ApiError(404, "not_found", "Formulation not found.")
    return row


def _version_row(session: Session, formulation_id: str, version: int) -> FormulationVersion | None:
    return session.scalars(
        select(FormulationVersion).where(
            FormulationVersion.formulation_id == formulation_id,
            FormulationVersion.version == version,
        )
    ).first()


def get_version(session: Session, formulation_id: str, version: int | None) -> FormulationVersion:
    """Return a stored version (``None`` = current). Ownership must be checked by the caller."""
    formulation = session.get(Formulation, formulation_id)
    if formulation is None:
        raise ApiError(404, "not_found", "Formulation not found.")
    if version is None:
        if formulation.current_version == 0:
            raise ApiError(422, "validation_failed", "Save the formulation before starting a job")
        version = formulation.current_version
    row = _version_row(session, formulation_id, version)
    if row is None:
        raise ApiError(404, "not_found", "Formulation version not found.")
    return row


def formulation_payload(
    formulation: Formulation, version_row: FormulationVersion | None
) -> dict[str, Any]:
    """The ``Formulation`` contract: lines/targets/note/hash come from the shown version."""
    shown = version_row.version if version_row else 0
    name = formulation.name
    if version_row is not None and version_row.version != formulation.current_version:
        name = version_row.name
    return {
        "id": formulation.id,
        "name": name,
        "description": formulation.description,
        "version": shown,
        "current_version": formulation.current_version,
        "lines": [
            {
                "ingredient_id": line["ingredient_id"],
                "percent": float(Decimal(str(line["percent"]))),
            }
            for line in (version_row.lines if version_row else [])
        ],
        "targets": version_row.targets if version_row else None,
        "note": version_row.note if version_row else None,
        "content_hash": version_row.content_hash if version_row else "",
        "archived": formulation.archived,
        "owner_id": formulation.owner_id,
        "created_at": iso(formulation.created_at),
        "updated_at": iso(formulation.updated_at),
    }


def full_payload(session: Session, formulation: Formulation, version: int | None) -> dict[str, Any]:
    """Payload for the requested version (None = current; version 0 has no lines yet)."""
    if version is None:
        if formulation.current_version == 0:
            return formulation_payload(formulation, None)
        version = formulation.current_version
    row = _version_row(session, formulation.id, version)
    if row is None:
        raise ApiError(404, "not_found", "Formulation version not found.")
    return formulation_payload(formulation, row)


# --------------------------------------------------------------------------- hashing / validation


def _plain(percent: Decimal) -> str:
    text = format(percent.normalize(), "f")
    return text


def stored_lines(lines: Sequence[LineIn]) -> list[dict[str, str]]:
    """Lines as persisted: percent as a decimal string (exact, never a float)."""
    return [
        {"ingredient_id": line.ingredient_id, "percent": _plain(line.percent)} for line in lines
    ]


def content_hash(lines: Sequence[dict[str, Any]], targets: dict[str, Any] | None) -> str:
    canonical = json.dumps(
        {
            "lines": sorted(
                (
                    {
                        "ingredient_id": line["ingredient_id"],
                        "percent": _plain(Decimal(str(line["percent"]))),
                    }
                    for line in lines
                ),
                key=lambda line: line["ingredient_id"],
            ),
            "targets": targets or {},
        },
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    return hashlib.sha256(canonical.encode()).hexdigest()


def run_validation(
    session: Session,
    lines: Sequence[LineIn] | Sequence[dict[str, Any]],
    targets: dict[str, Any] | None,
    *,
    new_version: bool = True,
) -> Any:
    """Single entry point so /validate, PUT and restore share identical results."""
    from app.domain.validation import validate_formulation

    domain_lines = [
        Line(
            ingredient_id=line.ingredient_id if isinstance(line, LineIn) else line["ingredient_id"],
            percent=line.percent if isinstance(line, LineIn) else Decimal(str(line["percent"])),
        )
        for line in lines
    ]
    ingredients = load_ingredient_data(session, [line.ingredient_id for line in domain_lines])
    return validate_formulation(domain_lines, ingredients, targets, new_version=new_version)


def validation_dict(result: Any) -> dict[str, Any]:
    data: dict[str, Any] = result.to_dict()
    total = data.get("total_percent")
    data["total_percent"] = float(total) if total is not None else None
    return data


def raise_if_invalid(result: Any) -> None:
    if result.valid:
        return
    data = validation_dict(result)
    issues = data["issues"]
    message = issues[0]["message"] if issues else "The formulation is not valid."
    raise ApiError(
        422,
        "validation_failed",
        message,
        {"issues": issues, "total_percent": data["total_percent"]},
    )


# --------------------------------------------------------------------------- writes


def create_version(
    session: Session,
    formulation: Formulation,
    *,
    lines: list[dict[str, str]],
    targets: dict[str, Any] | None,
    note: str | None,
    user: CurrentUser,
    name: str | None = None,
) -> FormulationVersion:
    """Insert the next immutable version and advance the header pointer."""
    next_version = formulation.current_version + 1
    row = FormulationVersion(
        formulation_id=formulation.id,
        version=next_version,
        name=name or formulation.name,
        lines=lines,
        targets=targets,
        note=note,
        content_hash=content_hash(lines, targets),
        created_by=user.user_id,
    )
    session.add(row)
    formulation.current_version = next_version
    session.flush()
    return row


def new_formulation(
    session: Session, user: CurrentUser, name: str, description: str | None
) -> Formulation:
    formulation = Formulation(
        id=new_id("frm"),
        owner_id=user.user_id,
        name=name,
        description=description,
        current_version=0,
        archived=False,
    )
    session.add(formulation)
    session.flush()
    return formulation


def copy_current_version(
    session: Session, source: Formulation, target: Formulation, user: CurrentUser
) -> FormulationVersion | None:
    if source.current_version == 0:
        return None
    src = _version_row(session, source.id, source.current_version)
    if src is None:
        return None
    return create_version(
        session,
        target,
        lines=[dict(line) for line in src.lines],
        targets=dict(src.targets) if src.targets else None,
        note=f"Copied from {source.name} (version {src.version})",
        user=user,
    )


# --------------------------------------------------------------------------- reads


def list_formulations(
    session: Session,
    user: CurrentUser,
    *,
    q: str | None,
    archived: bool,
    offset: int,
    limit: int,
) -> tuple[list[dict[str, Any]], int]:
    conds: list[Any] = [Formulation.owner_id == user.user_id, Formulation.archived == archived]
    if q:
        escaped = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        conds.append(Formulation.name.ilike(f"%{escaped}%", escape=_LIKE_ESCAPE))
    total = session.scalar(select(func.count(Formulation.id)).where(*conds)) or 0
    rows = session.scalars(
        select(Formulation)
        .where(*conds)
        .order_by(Formulation.updated_at.desc(), Formulation.id)
        .offset(offset)
        .limit(limit)
    ).all()
    items = []
    for f in rows:
        job = session.scalars(
            select(Job)
            .where(Job.formulation_id == f.id)
            .order_by(Job.created_at.desc(), Job.id.desc())
            .limit(1)
        ).first()
        items.append(
            {
                "id": f.id,
                "name": f.name,
                "current_version": f.current_version,
                "last_job": (
                    {
                        "id": job.id,
                        "type": job.type,
                        "status": job.status,
                        "finished_at": iso(job.finished_at),
                    }
                    if job
                    else None
                ),
                "updated_at": iso(f.updated_at),
            }
        )
    return items, total


def list_versions(
    session: Session, formulation_id: str, *, offset: int, limit: int
) -> tuple[list[dict[str, Any]], int]:
    total = (
        session.scalar(
            select(func.count(FormulationVersion.id)).where(
                FormulationVersion.formulation_id == formulation_id
            )
        )
        or 0
    )
    rows = session.execute(
        select(FormulationVersion, Profile.display_name)
        .join(Profile, Profile.user_id == FormulationVersion.created_by, isouter=True)
        .where(FormulationVersion.formulation_id == formulation_id)
        .order_by(FormulationVersion.version.desc())
        .offset(offset)
        .limit(limit)
    ).all()
    items = [
        {
            "version": v.version,
            "created_at": iso(v.created_at),
            "created_by": display or v.created_by,
            "note": v.note,
            "content_hash": v.content_hash,
        }
        for v, display in rows
    ]
    return items, total


def check_base_version(formulation: Formulation, base_version: int) -> None:
    if base_version != formulation.current_version:
        raise ApiError(
            409,
            "version_conflict",
            "The formulation was changed since you opened it.",
            {"current_version": formulation.current_version},
        )
