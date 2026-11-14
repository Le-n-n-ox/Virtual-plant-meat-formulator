"""Ingredient catalogue and reference-data routes (guide 6.2)."""

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Query

from app.api.deps import PagingDep, SessionDep, ViewerDep
from app.api.errors import ApiError
from app.db.repositories import ingredients as repo

router = APIRouter(tags=["ingredients"])


@router.get("/ingredients")
def list_ingredients(
    session: SessionDep,
    _user: ViewerDep,
    paging: PagingDep,
    q: Annotated[str | None, Query(max_length=200)] = None,
    crop: Annotated[str | None, Query(max_length=128)] = None,
    form: Annotated[str | None, Query(max_length=64)] = None,
    source_id: Annotated[str | None, Query(max_length=64)] = None,
    flag: Literal["analytical", "estimated"] | None = None,
    status: Literal["active", "draft", "retired", "all"] = "active",
    sort: Literal["common_name", "-common_name", "protein", "-protein", "created_at"] = (
        "common_name"
    ),
) -> dict[str, Any]:
    items, total = repo.list_ingredients(
        session,
        q=q,
        crop=crop,
        form=form,
        source_id=source_id,
        flag=flag,
        status=status,
        sort=sort,
        offset=paging.offset,
        limit=paging.page_size,
    )
    return paging.envelope(items, total)


@router.get("/ingredients/facets")
def ingredient_facets(session: SessionDep, _user: ViewerDep) -> dict[str, Any]:
    return repo.facets(session)


@router.get("/ingredients/{ingredient_id}")
def get_ingredient(ingredient_id: str, session: SessionDep, _user: ViewerDep) -> dict[str, Any]:
    ing = repo.get_ingredient(session, ingredient_id)
    if repo.license_forbids_display(ing.source):
        raise ApiError(
            403,
            "forbidden",
            "The licence of this ingredient's data source does not permit displaying it.",
            {"source_id": ing.source.id if ing.source else None},
        )
    return repo.ingredient_detail(session, ing)


@router.get("/nutrients")
def list_nutrients(session: SessionDep, _user: ViewerDep) -> list[dict[str, Any]]:
    return repo.nutrient_definitions(session)


@router.get("/amino-acid-patterns")
def list_amino_acid_patterns(session: SessionDep, _user: ViewerDep) -> list[dict[str, Any]]:
    return repo.list_patterns(session)
