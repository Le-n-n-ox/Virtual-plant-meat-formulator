"""Nutrition result retrieval."""

from typing import Annotated, Any

from fastapi import APIRouter, Query

from app.api.deps import ScientistDep, SessionDep
from app.db.repositories import results as repo

router = APIRouter(tags=["results"])


@router.get("/formulations/{formulation_id}/nutrition")
def get_nutrition(
    formulation_id: str,
    session: SessionDep,
    user: ScientistDep,
    version: Annotated[int | None, Query(ge=1)] = None,
) -> dict[str, Any]:
    formulation = repo.get_owned_formulation(session, formulation_id, user)
    return repo.nutrition_payload(session, formulation, version)
