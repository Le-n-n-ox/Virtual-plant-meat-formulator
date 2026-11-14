"""Formulation export download (PDF or CSV)."""

from typing import Annotated

from fastapi import APIRouter, Query
from fastapi.responses import Response
from sqlalchemy import select

from app.api.deps import RequestIdDep, ScientistDep, SessionDep, audit
from app.api.errors import ApiError
from app.db.models import FormulationVersion
from app.db.repositories import results as repo
from app.services import exports as svc

router = APIRouter(tags=["exports"])


@router.get("/formulations/{formulation_id}/export")
def export_formulation(
    formulation_id: str,
    session: SessionDep,
    user: ScientistDep,
    request_id: RequestIdDep,
    format: Annotated[str, Query()] = "pdf",  # noqa: A002 - public query parameter name
    version: Annotated[int | None, Query(ge=1)] = None,
) -> Response:
    if format not in ("pdf", "csv"):
        raise ApiError(400, "bad_request", "format must be pdf or csv.", {"format": format})
    formulation = repo.get_owned_formulation(session, formulation_id, user)
    ver = repo.resolve_version(formulation, version)
    fv = session.scalar(
        select(FormulationVersion).where(
            FormulationVersion.formulation_id == formulation.id,
            FormulationVersion.version == ver,
        )
    )
    if fv is None:
        raise ApiError(404, "not_found", "Formulation version not found.")
    ctx = svc.build_export_context(session, formulation, fv, request_id=request_id)
    filename = f"{svc.slugify(formulation.name)}-v{ver}.{format}"
    audit(
        session,
        actor_id=user.user_id,
        action="export",
        entity="formulation",
        entity_id=formulation.id,
        payload={"format": format, "version": ver},
        request_id=request_id,
    )
    if format == "csv":
        content: bytes = svc.render_csv(ctx).encode("utf-8")
        media = "text/csv; charset=utf-8"
    else:
        content = svc.render_pdf(ctx)
        media = "application/pdf"
    return Response(
        content=content,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
