"""Model registry read routes (guide 6.5). Lifecycle changes live in the admin router."""

from typing import Annotated, Any

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.api.deps import PagingDep, SessionDep, ViewerDep
from app.api.errors import ApiError
from app.db.models import ModelRegistry

router = APIRouter(tags=["models"])


@router.get("/models")
def list_models(
    session: SessionDep,
    _user: ViewerDep,
    paging: PagingDep,
    target: Annotated[str | None, Query(max_length=64)] = None,
    status: Annotated[str, Query(max_length=16)] = "approved",
) -> dict[str, Any]:
    from app.mlops.registry import model_meta

    conds: list[Any] = []
    if target:
        conds.append(ModelRegistry.target == target)
    if status != "all":
        conds.append(ModelRegistry.status == status)
    total = session.scalar(select(func.count(ModelRegistry.id)).where(*conds)) or 0
    rows = session.scalars(
        select(ModelRegistry)
        .where(*conds)
        .order_by(ModelRegistry.created_at.desc(), ModelRegistry.id)
        .offset(paging.offset)
        .limit(paging.page_size)
    ).all()
    return paging.envelope([model_meta(r) for r in rows], total)


@router.get("/models/{model_id}")
def get_model(model_id: str, session: SessionDep, _user: ViewerDep) -> dict[str, Any]:
    from app.mlops.registry import model_detail

    row = session.get(ModelRegistry, model_id)
    if row is None:
        raise ApiError(404, "not_found", "Model not found.")
    return model_detail(row)
