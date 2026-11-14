"""Back-office routes (guide 6.6): users, ingredients, imports, experiments, models, audit."""

from typing import Annotated, Any

from fastapi import APIRouter, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import (
    AdminDep,
    CuratorDep,
    PagingDep,
    RequestIdDep,
    SessionDep,
    SettingsDep,
    audit,
)
from app.api.errors import ApiError
from app.core.ids import iso, new_id
from app.core.security import hash_password
from app.db.models import (
    AuditLog,
    DataSource,
    Experiment,
    Ingredient,
    IngredientFunctionalProperty,
    IngredientImport,
    IngredientPrice,
    Measurement,
    ModelRegistry,
    Profile,
    Sample,
)
from app.db.repositories import imports as imp
from app.db.repositories.ingredients import ingredient_detail, replace_nutrients
from app.schemas.admin import (
    ExperimentCreate,
    ImportCommitIn,
    ImportCsvIn,
    IngredientCreate,
    IngredientUpdate,
    MeasurementCreate,
    SampleCreate,
    UserCreate,
    UserPatch,
)

router = APIRouter(tags=["admin"])


# --------------------------------------------------------------------------- users


def _user_dict(p: Profile) -> dict[str, Any]:
    return {
        "user_id": p.user_id,
        "email": p.email,
        "display_name": p.display_name,
        "role": p.role,
        "active": p.active,
        "created_at": iso(p.created_at),
    }


@router.get("/admin/users")
def list_users(session: SessionDep, _admin: AdminDep, paging: PagingDep) -> dict[str, Any]:
    total = session.scalar(select(func.count(Profile.user_id))) or 0
    rows = session.scalars(
        select(Profile).order_by(Profile.email).offset(paging.offset).limit(paging.page_size)
    ).all()
    return paging.envelope([_user_dict(p) for p in rows], total)


@router.post("/admin/users", status_code=201)
def create_user(
    body: UserCreate,
    session: SessionDep,
    settings: SettingsDep,
    admin: AdminDep,
    request_id: RequestIdDep,
) -> dict[str, Any]:
    if settings.auth_mode != "local":
        raise ApiError(
            400, "bad_request", "Users are managed in Supabase when AUTH_MODE is supabase."
        )
    email = body.email.strip().lower()
    taken = session.scalar(select(Profile.user_id).where(func.lower(Profile.email) == email))
    if taken:
        raise ApiError(409, "conflict", "A user with this email already exists.")
    profile = Profile(
        user_id=new_id("usr"),
        email=email,
        display_name=body.display_name,
        role=body.role,
        password_hash=hash_password(body.password),
        active=True,
    )
    session.add(profile)
    session.flush()
    audit(
        session,
        actor_id=admin.user_id,
        action="user.create",
        entity="profile",
        entity_id=profile.user_id,
        payload={"email": email, "role": body.role},
        request_id=request_id,
    )
    return _user_dict(profile)


@router.patch("/admin/users/{user_id}")
def patch_user(
    user_id: str,
    body: UserPatch,
    session: SessionDep,
    admin: AdminDep,
    request_id: RequestIdDep,
) -> dict[str, Any]:
    profile = session.get(Profile, user_id)
    if profile is None:
        raise ApiError(404, "not_found", "User not found.")
    changes = body.model_dump(exclude_unset=True)
    if user_id == admin.user_id and (
        changes.get("active") is False or changes.get("role", admin.role) != admin.role
    ):
        raise ApiError(400, "bad_request", "You cannot demote or disable your own account.")
    before = {k: getattr(profile, k) for k in changes}
    for key, value in changes.items():
        if value is not None:
            setattr(profile, key, value)
    session.flush()
    audit(
        session,
        actor_id=admin.user_id,
        action="user.update",
        entity="profile",
        entity_id=user_id,
        payload={"before": before, "after": changes},
        request_id=request_id,
    )
    return _user_dict(profile)


# --------------------------------------------------------------------------- ingredients


def _snapshot(ing: Ingredient) -> dict[str, Any]:
    fields = (
        "common_name scientific_name variety form crop food_group origin moisture_basis "
        "source_id source_row_ref method analysed_on quality_flag status dataset_version"
    ).split()
    snap: dict[str, Any] = {f: getattr(ing, f) for f in fields}
    snap["moisture_percent"] = None if ing.moisture_percent is None else str(ing.moisture_percent)
    snap["edible_portion_percent"] = (
        None if ing.edible_portion_percent is None else str(ing.edible_portion_percent)
    )
    snap["nutrients"] = {
        n.nutrient_key: {"value": None if n.value is None else str(n.value), "unit": n.unit}
        for n in ing.nutrients
    }
    return snap


def _prepared_nutrients(session: Session, nutrients: list[Any]) -> list[dict[str, Any]]:
    ready, errors = imp.prepare_nutrients(session, [n.model_dump() for n in nutrients])
    if errors:
        raise ApiError(422, "validation_failed", errors[0]["message"], {"issues": errors})
    return ready


def _require_source(session: Session, source_id: str) -> None:
    if session.get(DataSource, source_id) is None:
        raise ApiError(
            422,
            "validation_failed",
            f"Unknown source_id '{source_id}'.",
            {"issues": [{"code": "unknown_source", "message": f"Unknown source '{source_id}'."}]},
        )


@router.post("/admin/ingredients", status_code=201)
def create_ingredient(
    body: IngredientCreate,
    session: SessionDep,
    curator: CuratorDep,
    request_id: RequestIdDep,
) -> dict[str, Any]:
    _require_source(session, body.source_id)
    nutrients = _prepared_nutrients(session, body.nutrients)
    data = body.model_dump(exclude={"nutrients", "functional_properties", "price"})
    ing = Ingredient(
        id=new_id("ing"),
        dataset_version=imp.next_dataset_version(session),
        is_fake=False,
        **data,
    )
    session.add(ing)
    replace_nutrients(ing, nutrients)
    for fp in body.functional_properties:
        ing.functional_properties.append(
            IngredientFunctionalProperty(source_id=body.source_id, **fp.model_dump())
        )
    if body.price:
        ing.prices.append(IngredientPrice(**body.price.model_dump()))
    session.flush()
    audit(
        session,
        actor_id=curator.user_id,
        action="ingredient.create",
        entity="ingredient",
        entity_id=ing.id,
        payload={"dataset_version": ing.dataset_version, "source_id": ing.source_id},
        request_id=request_id,
    )
    return ingredient_detail(session, ing)


@router.put("/admin/ingredients/{ingredient_id}")
def update_ingredient(
    ingredient_id: str,
    body: IngredientUpdate,
    session: SessionDep,
    curator: CuratorDep,
    request_id: RequestIdDep,
) -> dict[str, Any]:
    ing = session.get(Ingredient, ingredient_id)
    if ing is None:
        raise ApiError(404, "not_found", "Ingredient not found.")
    changes = body.model_dump(exclude_unset=True)
    nutrients_in = changes.pop("nutrients", None)
    if changes.get("source_id"):
        _require_source(session, changes["source_id"])
    for required in ("common_name", "scientific_name", "form", "origin", "moisture_basis"):
        if required in changes and changes[required] is None:
            raise ApiError(422, "validation_failed", f"{required} cannot be cleared.")
    if "moisture_percent" in changes and changes["moisture_percent"] is None:
        raise ApiError(422, "validation_failed", "moisture_percent cannot be cleared.")
    prepared = (
        _prepared_nutrients(session, body.nutrients)
        if nutrients_in is not None and body.nutrients
        else None
    )
    before = _snapshot(ing)
    for key, value in changes.items():
        setattr(ing, key, value)
    if prepared is not None:
        replace_nutrients(ing, prepared)
    # Edits never silently alter old numbers: they publish a new dataset version.
    ing.dataset_version = imp.next_dataset_version(session)
    session.flush()
    audit(
        session,
        actor_id=curator.user_id,
        action="ingredient.update",
        entity="ingredient",
        entity_id=ing.id,
        payload={"before": before, "new_dataset_version": ing.dataset_version},
        request_id=request_id,
    )
    session.refresh(ing)
    return ingredient_detail(session, ing)


# --------------------------------------------------------------------------- imports


@router.post("/admin/imports/ingredients", status_code=201)
def stage_import(
    body: ImportCsvIn,
    session: SessionDep,
    settings: SettingsDep,
    curator: CuratorDep,
    request_id: RequestIdDep,
) -> dict[str, Any]:
    staged = imp.stage_import(session, body.csv, curator.user_id, settings.max_request_bytes)
    audit(
        session,
        actor_id=curator.user_id,
        action="import.validate",
        entity="ingredient_import",
        entity_id=staged.id,
        payload=staged.report["summary"],
        request_id=request_id,
    )
    return {"import_id": staged.id, "report": staged.report}


@router.post("/admin/imports/{import_id}/commit")
def commit_import(
    import_id: str,
    session: SessionDep,
    curator: CuratorDep,
    request_id: RequestIdDep,
    body: ImportCommitIn | None = None,
) -> dict[str, Any]:
    staged = session.get(IngredientImport, import_id)
    if staged is None:
        raise ApiError(404, "not_found", "Import not found.")
    include = bool(body and body.include_flagged)
    ids, version = imp.commit_import(session, staged, include_flagged=include)
    audit(
        session,
        actor_id=curator.user_id,
        action="import.commit",
        entity="ingredient_import",
        entity_id=import_id,
        payload={"dataset_version": version, "ingredient_ids": ids, "include_flagged": include},
        request_id=request_id,
    )
    return {"import_id": import_id, "dataset_version": version, "ingredient_ids": ids}


# --------------------------------------------------------------------------- experiments


@router.post("/admin/experiments", status_code=201)
def create_experiment(
    body: ExperimentCreate,
    session: SessionDep,
    curator: CuratorDep,
    request_id: RequestIdDep,
) -> dict[str, Any]:
    if body.source_id:
        _require_source(session, body.source_id)
    exp = Experiment(id=new_id("exp"), **body.model_dump())
    session.add(exp)
    session.flush()
    audit(
        session,
        actor_id=curator.user_id,
        action="experiment.create",
        entity="experiment",
        entity_id=exp.id,
        request_id=request_id,
    )
    return {"id": exp.id, **body.model_dump(), "created_at": iso(exp.created_at)}


@router.post("/admin/experiments/{experiment_id}/samples", status_code=201)
def create_sample(
    experiment_id: str,
    body: SampleCreate,
    session: SessionDep,
    curator: CuratorDep,
    request_id: RequestIdDep,
) -> dict[str, Any]:
    if session.get(Experiment, experiment_id) is None:
        raise ApiError(404, "not_found", "Experiment not found.")
    sample = Sample(id=new_id("smp"), experiment_id=experiment_id, **body.model_dump())
    session.add(sample)
    session.flush()
    audit(
        session,
        actor_id=curator.user_id,
        action="sample.create",
        entity="sample",
        entity_id=sample.id,
        payload={"experiment_id": experiment_id},
        request_id=request_id,
    )
    return {"id": sample.id, "experiment_id": experiment_id, **body.model_dump()}


@router.post("/admin/samples/{sample_id}/measurements", status_code=201)
def create_measurement(
    sample_id: str,
    body: MeasurementCreate,
    session: SessionDep,
    curator: CuratorDep,
    request_id: RequestIdDep,
) -> dict[str, Any]:
    if session.get(Sample, sample_id) is None:
        raise ApiError(404, "not_found", "Sample not found.")
    row = Measurement(sample_id=sample_id, **body.model_dump())
    session.add(row)
    session.flush()
    synthetic = body.source_type == "synthetic"
    audit(
        session,
        actor_id=curator.user_id,
        action="measurement.create",
        entity="measurement",
        entity_id=str(row.id),
        payload={"sample_id": sample_id, "source_type": body.source_type},
        request_id=request_id,
    )
    out = {"id": row.id, "sample_id": sample_id, **body.model_dump()}
    out["value"] = float(body.value)
    out["sd"] = None if body.sd is None else float(body.sd)
    out["never_for_training"] = synthetic
    if synthetic:
        out["warning"] = "Synthetic data is stored but is never used for model training."
    return out


# --------------------------------------------------------------------------- models


def _model_action(
    action: str,
    model_id: str,
    session: Session,
    admin: Any,
    request_id: str,
) -> dict[str, Any]:
    from app.mlops import registry

    row = session.get(ModelRegistry, model_id)
    if row is None:
        raise ApiError(404, "not_found", "Model not found.")
    before = row.status
    if action == "approve":
        registry.approve_model(session, model_id, admin.user_id)
    else:
        registry.retire_model(session, model_id)
    session.flush()
    session.refresh(row)
    audit(
        session,
        actor_id=admin.user_id,
        action=f"model.{action}",
        entity="model",
        entity_id=model_id,
        payload={"from": before, "to": row.status},
        request_id=request_id,
    )
    return registry.model_detail(row)


@router.post("/admin/models/{model_id}/approve")
def approve_model(
    model_id: str, session: SessionDep, admin: AdminDep, request_id: RequestIdDep
) -> dict[str, Any]:
    return _model_action("approve", model_id, session, admin, request_id)


@router.post("/admin/models/{model_id}/retire")
def retire_model(
    model_id: str, session: SessionDep, admin: AdminDep, request_id: RequestIdDep
) -> dict[str, Any]:
    return _model_action("retire", model_id, session, admin, request_id)


# --------------------------------------------------------------------------- audit log


@router.get("/admin/audit-log")
def audit_log(
    session: SessionDep,
    _admin: AdminDep,
    paging: PagingDep,
    actor_id: Annotated[str | None, Query(max_length=64)] = None,
    action: Annotated[str | None, Query(max_length=64)] = None,
    entity: Annotated[str | None, Query(max_length=64)] = None,
    entity_id: Annotated[str | None, Query(max_length=64)] = None,
) -> dict[str, Any]:
    conds: list[Any] = []
    for column, value in (
        (AuditLog.actor_id, actor_id),
        (AuditLog.action, action),
        (AuditLog.entity, entity),
        (AuditLog.entity_id, entity_id),
    ):
        if value:
            conds.append(column == value)
    total = session.scalar(select(func.count(AuditLog.id)).where(*conds)) or 0
    rows = session.scalars(
        select(AuditLog)
        .where(*conds)
        .order_by(AuditLog.id.desc())
        .offset(paging.offset)
        .limit(paging.page_size)
    ).all()
    items = [
        {
            "id": r.id,
            "actor_id": r.actor_id,
            "action": r.action,
            "entity": r.entity,
            "entity_id": r.entity_id,
            "payload": r.payload,
            "request_id": r.request_id,
            "created_at": iso(r.created_at),
        }
        for r in rows
    ]
    return paging.envelope(items, total)
