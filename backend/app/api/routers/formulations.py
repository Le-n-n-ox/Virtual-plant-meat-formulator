"""Formulation routes (guide 6.3): header edits, immutable versions, validation, restore."""

from typing import Annotated, Any

from fastapi import APIRouter, Query
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, PagingDep, RequestIdDep, ScientistDep, SessionDep, audit
from app.api.errors import ApiError
from app.db.repositories import formulations as repo
from app.schemas.formulations import (
    DuplicateIn,
    FormulationCreate,
    FormulationPatch,
    FormulationUpdate,
    RestoreIn,
    ValidateIn,
)

router = APIRouter(tags=["formulations"])


@router.get("/formulations")
def list_formulations(
    session: SessionDep,
    user: ScientistDep,
    paging: PagingDep,
    q: Annotated[str | None, Query(max_length=200)] = None,
    archived: bool = False,
) -> dict[str, Any]:
    items, total = repo.list_formulations(
        session, user, q=q, archived=archived, offset=paging.offset, limit=paging.page_size
    )
    return paging.envelope(items, total)


@router.post("/formulations", status_code=201)
def create_formulation(
    body: FormulationCreate,
    session: SessionDep,
    user: ScientistDep,
    request_id: RequestIdDep,
) -> dict[str, Any]:
    formulation = repo.new_formulation(session, user, body.name, body.description)
    if body.template_id:
        template = repo.get_owned_formulation(session, body.template_id, user)
        repo.copy_current_version(session, template, formulation, user)
    audit(
        session,
        actor_id=user.user_id,
        action="formulation.create",
        entity="formulation",
        entity_id=formulation.id,
        payload={"template_id": body.template_id},
        request_id=request_id,
    )
    return repo.full_payload(session, formulation, None)


@router.get("/formulations/{formulation_id}")
def get_formulation(
    formulation_id: str,
    session: SessionDep,
    user: ScientistDep,
    version: Annotated[int | None, Query(ge=1)] = None,
) -> dict[str, Any]:
    formulation = repo.get_owned_formulation(session, formulation_id, user)
    return repo.full_payload(session, formulation, version)


def _save_version(
    session: Session,
    user: CurrentUser,
    request_id: str,
    formulation_id: str,
    *,
    base_version: int,
    lines: Any,
    targets: dict[str, Any] | None,
    note: str | None,
    name: str | None,
    description: str | None,
    action: str,
) -> dict[str, Any]:
    formulation = repo.get_owned_formulation(session, formulation_id, user, lock=True)
    repo.check_base_version(formulation, base_version)
    result = repo.run_validation(session, lines, targets, new_version=True)
    repo.raise_if_invalid(result)
    if name:
        formulation.name = name
    if description is not None:
        formulation.description = description
    stored = repo.stored_lines(lines)
    row = repo.create_version(
        session, formulation, lines=stored, targets=targets, note=note, user=user, name=name
    )
    audit(
        session,
        actor_id=user.user_id,
        action=action,
        entity="formulation",
        entity_id=formulation.id,
        payload={"version": row.version, "content_hash": row.content_hash},
        request_id=request_id,
    )
    return repo.formulation_payload(formulation, row)


@router.put("/formulations/{formulation_id}")
def update_formulation(
    formulation_id: str,
    body: FormulationUpdate,
    session: SessionDep,
    user: ScientistDep,
    request_id: RequestIdDep,
) -> dict[str, Any]:
    return _save_version(
        session,
        user,
        request_id,
        formulation_id,
        base_version=body.base_version,
        lines=body.lines,
        targets=body.targets,
        note=body.note,
        name=body.name,
        description=body.description,
        action="formulation.save",
    )


@router.patch("/formulations/{formulation_id}")
def patch_formulation(
    formulation_id: str,
    body: FormulationPatch,
    session: SessionDep,
    user: ScientistDep,
    request_id: RequestIdDep,
) -> dict[str, Any]:
    formulation = repo.get_owned_formulation(session, formulation_id, user)
    changes = body.model_dump(exclude_unset=True)
    if "name" in changes and changes["name"]:
        formulation.name = changes["name"]
    if "description" in changes:
        formulation.description = changes["description"]
    if changes.get("archived") is not None:
        formulation.archived = bool(changes["archived"])
    session.flush()
    audit(
        session,
        actor_id=user.user_id,
        action="formulation.update_header",
        entity="formulation",
        entity_id=formulation.id,
        payload={"fields": sorted(changes)},
        request_id=request_id,
    )
    return repo.full_payload(session, formulation, None)


@router.post("/formulations/{formulation_id}/duplicate", status_code=201)
def duplicate_formulation(
    formulation_id: str,
    session: SessionDep,
    user: ScientistDep,
    request_id: RequestIdDep,
    body: DuplicateIn | None = None,
) -> dict[str, Any]:
    source = repo.get_owned_formulation(session, formulation_id, user)
    name = (body.name if body and body.name else f"{source.name} (copy)")[:255]
    copy = repo.new_formulation(session, user, name, source.description)
    repo.copy_current_version(session, source, copy, user)
    audit(
        session,
        actor_id=user.user_id,
        action="formulation.duplicate",
        entity="formulation",
        entity_id=copy.id,
        payload={"source_id": source.id, "source_version": source.current_version},
        request_id=request_id,
    )
    return repo.full_payload(session, copy, None)


@router.post("/formulations/{formulation_id}/validate")
def validate_lines(
    formulation_id: str,
    body: ValidateIn,
    session: SessionDep,
    user: ScientistDep,
) -> dict[str, Any]:
    repo.get_owned_formulation(session, formulation_id, user)
    result = repo.run_validation(session, body.lines, body.targets, new_version=True)
    return repo.validation_dict(result)


@router.get("/formulations/{formulation_id}/versions")
def list_versions(
    formulation_id: str,
    session: SessionDep,
    user: ScientistDep,
    paging: PagingDep,
) -> dict[str, Any]:
    repo.get_owned_formulation(session, formulation_id, user)
    items, total = repo.list_versions(
        session, formulation_id, offset=paging.offset, limit=paging.page_size
    )
    return paging.envelope(items, total)


@router.get("/formulations/{formulation_id}/versions/{version}")
def get_version(
    formulation_id: str,
    version: int,
    session: SessionDep,
    user: ScientistDep,
) -> dict[str, Any]:
    formulation = repo.get_owned_formulation(session, formulation_id, user)
    if version < 1:
        raise ApiError(404, "not_found", "Formulation version not found.")
    return repo.full_payload(session, formulation, version)


@router.post("/formulations/{formulation_id}/versions/{version}/restore")
def restore_version(
    formulation_id: str,
    version: int,
    body: RestoreIn,
    session: SessionDep,
    user: ScientistDep,
    request_id: RequestIdDep,
) -> dict[str, Any]:
    formulation = repo.get_owned_formulation(session, formulation_id, user, lock=True)
    old = repo.get_version(session, formulation_id, version)
    repo.check_base_version(formulation, body.base_version)
    lines = [dict(line) for line in old.lines]
    result = repo.run_validation(session, lines, old.targets, new_version=True)
    repo.raise_if_invalid(result)
    row = repo.create_version(
        session,
        formulation,
        lines=lines,
        targets=dict(old.targets) if old.targets else None,
        note=f"Restored from version {version}",
        user=user,
    )
    audit(
        session,
        actor_id=user.user_id,
        action="formulation.restore",
        entity="formulation",
        entity_id=formulation.id,
        payload={"version": row.version, "restored_from": version},
        request_id=request_id,
    )
    return repo.formulation_payload(formulation, row)
