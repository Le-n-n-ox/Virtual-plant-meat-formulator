"""Ingredient catalogue queries and conversion of ORM rows into domain data."""

from collections.abc import Iterable, Sequence
from decimal import Decimal
from typing import Any

from sqlalchemy import Select, exists, func, or_, select
from sqlalchemy.orm import Session

from app.api.errors import ApiError
from app.db.models import (
    AminoAcidReferencePattern,
    DataSource,
    Ingredient,
    IngredientNutrient,
    NutrientDefinition,
)
from app.domain.types import (
    AMINO_ACID_KEYS,
    AminoAcidPattern,
    IngredientData,
    NutrientRow,
)
from app.schemas.common import fnum

SORTS = ("common_name", "-common_name", "protein", "-protein", "created_at")


def _like(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def amino_acid_keys(session: Session) -> set[str]:
    keys = set(
        session.scalars(
            select(NutrientDefinition.key).where(NutrientDefinition.kind == "amino_acid")
        )
    )
    return keys or set(AMINO_ACID_KEYS)


def license_forbids_display(source: DataSource | None) -> bool:
    """A source forbids display only when it is ``restricted`` AND its licence notes carry the
    ``[no-display]`` marker. Plain ``restricted`` (e.g. KFCT 2018: non-commercial research use
    with acknowledgement) means "excluded from exports, displayed with acknowledgement"."""
    return bool(
        source
        and source.license_status == "restricted"
        and "[no-display]" in (source.license_notes or "")
    )


def _protein_subquery() -> Any:
    return (
        select(IngredientNutrient.value)
        .where(
            IngredientNutrient.ingredient_id == Ingredient.id,
            IngredientNutrient.nutrient_key == "protein",
        )
        .scalar_subquery()
    )


def _conditions(
    *,
    q: str | None,
    crop: str | None,
    form: str | None,
    source_id: str | None,
    flag: str | None,
    status: str | None,
) -> list[Any]:
    conds: list[Any] = []
    if status and status != "all":
        conds.append(Ingredient.status == status)
    if q:
        pattern = _like(q.strip())
        conds.append(
            or_(
                Ingredient.common_name.ilike(pattern, escape="\\"),
                Ingredient.scientific_name.ilike(pattern, escape="\\"),
                Ingredient.crop.ilike(pattern, escape="\\"),
            )
        )
    if crop:
        conds.append(Ingredient.crop == crop)
    if form:
        conds.append(Ingredient.form == form)
    if source_id:
        conds.append(Ingredient.source_id == source_id)
    if flag:
        conds.append(
            or_(
                Ingredient.quality_flag == flag,
                exists().where(
                    IngredientNutrient.ingredient_id == Ingredient.id,
                    IngredientNutrient.flag == flag,
                ),
            )
        )
    return conds


def list_ingredients(
    session: Session,
    *,
    q: str | None = None,
    crop: str | None = None,
    form: str | None = None,
    source_id: str | None = None,
    flag: str | None = None,
    status: str | None = "active",
    sort: str = "common_name",
    offset: int = 0,
    limit: int = 25,
) -> tuple[list[dict[str, Any]], int]:
    conds = _conditions(q=q, crop=crop, form=form, source_id=source_id, flag=flag, status=status)
    total = session.scalar(select(func.count(Ingredient.id)).where(*conds)) or 0
    stmt: Select[Any] = select(Ingredient).where(*conds)
    protein = _protein_subquery()
    if sort == "-common_name":
        stmt = stmt.order_by(Ingredient.common_name.desc(), Ingredient.id)
    elif sort == "protein":
        stmt = stmt.order_by(protein.asc().nulls_last(), Ingredient.common_name, Ingredient.id)
    elif sort == "-protein":
        stmt = stmt.order_by(protein.desc().nulls_last(), Ingredient.common_name, Ingredient.id)
    elif sort == "created_at":
        stmt = stmt.order_by(Ingredient.created_at, Ingredient.id)
    else:
        stmt = stmt.order_by(Ingredient.common_name, Ingredient.id)
    rows = session.scalars(stmt.offset(offset).limit(limit)).unique().all()
    aa = amino_acid_keys(session)
    return [ingredient_list_item(r, aa) for r in rows], total


def ingredient_list_item(ing: Ingredient, aa_keys: set[str]) -> dict[str, Any]:
    protein = next((n.value for n in ing.nutrients if n.nutrient_key == "protein"), None)
    return {
        "id": ing.id,
        "common_name": ing.common_name,
        "scientific_name": ing.scientific_name,
        "variety": ing.variety,
        "form": ing.form,
        "crop": ing.crop,
        "moisture_basis": ing.moisture_basis,
        "source": {"id": ing.source.id, "name": ing.source.name} if ing.source else None,
        "quality_flag": ing.quality_flag,
        "protein_g_per_100g": fnum(protein),
        "has_amino_acids": any(
            n.nutrient_key in aa_keys and n.value is not None for n in ing.nutrients
        ),
        "is_fake": ing.is_fake,
        "dataset_version": ing.dataset_version,
    }


def facets(session: Session) -> dict[str, Any]:
    active = Ingredient.status == "active"

    def grouped(column: Any) -> list[dict[str, Any]]:
        rows = session.execute(
            select(column, func.count(Ingredient.id))
            .where(active, column.is_not(None))
            .group_by(column)
            .order_by(column)
        ).all()
        return [{"value": value, "count": count} for value, count in rows]

    sources = session.execute(
        select(DataSource.id, DataSource.name, func.count(Ingredient.id))
        .join(Ingredient, Ingredient.source_id == DataSource.id)
        .where(active)
        .group_by(DataSource.id, DataSource.name)
        .order_by(DataSource.name)
    ).all()
    return {
        "crops": grouped(Ingredient.crop),
        "forms": grouped(Ingredient.form),
        "sources": [{"id": i, "name": n, "count": c} for i, n, c in sources],
    }


def get_ingredient(session: Session, ingredient_id: str) -> Ingredient:
    ing = session.get(Ingredient, ingredient_id)
    if ing is None:
        raise ApiError(404, "not_found", "Ingredient not found.")
    return ing


def ingredient_detail(session: Session, ing: Ingredient) -> dict[str, Any]:
    defs = {d.key: d for d in session.scalars(select(NutrientDefinition))}

    def value_dict(n: IngredientNutrient) -> dict[str, Any]:
        d = defs.get(n.nutrient_key)
        out: dict[str, Any] = {
            "key": n.nutrient_key,
            "name": d.name if d else n.nutrient_key,
            "value": fnum(n.value),
            "unit": n.unit,
            "flag": n.flag,
        }
        if n.range_low is not None and n.range_high is not None:
            out["range"] = [float(n.range_low), float(n.range_high)]
        return out

    def order(n: IngredientNutrient) -> tuple[int, str]:
        d = defs.get(n.nutrient_key)
        return (d.sort_order if d else 10_000, n.nutrient_key)

    nutrients: list[dict[str, Any]] = []
    amino: list[dict[str, Any]] = []
    for n in sorted(ing.nutrients, key=order):
        d = defs.get(n.nutrient_key)
        (amino if d and d.kind == "amino_acid" else nutrients).append(value_dict(n))
    src = ing.source
    price = ing.prices[0] if ing.prices else None
    return {
        "id": ing.id,
        "scientific_name": ing.scientific_name,
        "common_name": ing.common_name,
        "variety": ing.variety,
        "form": ing.form,
        "crop": ing.crop,
        "food_group": ing.food_group,
        "origin": ing.origin,
        "moisture_basis": ing.moisture_basis,
        "moisture_percent": fnum(ing.moisture_percent),
        "edible_portion_percent": fnum(ing.edible_portion_percent),
        "quality_flag": ing.quality_flag,
        "status": ing.status,
        "is_fake": ing.is_fake,
        "dataset_version": ing.dataset_version,
        "nutrients": nutrients,
        "amino_acids": amino,
        "source": {
            "id": src.id if src else None,
            "name": src.name if src else None,
            "method": ing.method,
            "date": ing.analysed_on,
            "license_status": src.license_status if src else "unknown",
            "citation": src.citation if src else None,
            "url": src.url if src else None,
            "license_notes": src.license_notes if src else None,
        },
        "functional_properties": [
            {
                "property": f.property,
                "value": float(f.value),
                "unit": f.unit,
                "method": f.method,
            }
            for f in ing.functional_properties
        ],
        "price": (
            {
                "price_per_kg": float(price.price_per_kg),
                "currency": price.currency,
                "as_of": price.as_of,
                "source": price.source,
            }
            if price
            else None
        ),
    }


def nutrient_definitions(session: Session) -> list[dict[str, Any]]:
    rows = session.scalars(
        select(NutrientDefinition).order_by(NutrientDefinition.sort_order, NutrientDefinition.key)
    )
    return [
        {
            "key": d.key,
            "name": d.name,
            "unit": d.unit,
            "kind": d.kind,
            "infoods_tagname": d.infoods_tagname,
        }
        for d in rows
    ]


def pattern_dict(p: AminoAcidReferencePattern) -> dict[str, Any]:
    return {
        "id": p.id,
        "name": p.name,
        "version": p.version,
        "citation": p.citation,
        "values": p.values,
        "groupings": p.groupings or {},
        "is_default": p.is_default,
    }


def list_patterns(session: Session) -> list[dict[str, Any]]:
    rows = session.scalars(select(AminoAcidReferencePattern).order_by(AminoAcidReferencePattern.id))
    return [pattern_dict(p) for p in rows]


# --------------------------------------------------------------------------- domain loaders


def to_ingredient_data(ing: Ingredient) -> IngredientData:
    nutrients = {
        n.nutrient_key: NutrientRow(
            key=n.nutrient_key,
            value=n.value,
            unit=n.unit,
            flag=n.flag,
            range_low=n.range_low,
            range_high=n.range_high,
            per_basis=n.per_basis,
        )
        for n in ing.nutrients
    }
    price = ing.prices[0] if ing.prices else None
    return IngredientData(
        id=ing.id,
        common_name=ing.common_name,
        status=ing.status,
        form=ing.form,
        crop=ing.crop,
        moisture_basis=ing.moisture_basis,
        moisture_percent=ing.moisture_percent,
        nutrients=nutrients,
        functional_properties={f.property: f.value for f in ing.functional_properties},
        price_per_kg=price.price_per_kg if price else None,
        price_currency=price.currency if price else None,
        dataset_version=ing.dataset_version,
        license_status=ing.source.license_status if ing.source else "unknown",
    )


def load_ingredient_data(
    session: Session, ingredient_ids: Iterable[str]
) -> dict[str, IngredientData]:
    """Domain view of the requested ingredients (unknown ids are simply absent)."""
    ids = sorted(set(ingredient_ids))
    if not ids:
        return {}
    rows = session.scalars(select(Ingredient).where(Ingredient.id.in_(ids))).unique().all()
    return {r.id: to_ingredient_data(r) for r in rows}


def dataset_versions(session: Session, ingredient_ids: Iterable[str]) -> dict[str, str]:
    ids = sorted(set(ingredient_ids))
    if not ids:
        return {"ingredients": ""}
    versions = session.scalars(
        select(Ingredient.dataset_version)
        .where(Ingredient.id.in_(ids))
        .distinct()
        .order_by(Ingredient.dataset_version)
    ).all()
    return {"ingredients": ",".join(versions)}


def get_pattern(session: Session, pattern_id: str | None) -> AminoAcidPattern:
    if pattern_id is None:
        row = session.scalars(
            select(AminoAcidReferencePattern)
            .order_by(AminoAcidReferencePattern.is_default.desc(), AminoAcidReferencePattern.id)
            .limit(1)
        ).first()
        if row is None:
            raise ApiError(
                422,
                "validation_failed",
                "No amino-acid reference pattern is loaded; run the seed or import one.",
            )
    else:
        row = session.get(AminoAcidReferencePattern, pattern_id)
        if row is None:
            raise ApiError(404, "not_found", "Amino-acid reference pattern not found.")
    return AminoAcidPattern(
        id=row.id,
        name=row.name,
        version=row.version,
        values={k: Decimal(str(v)) for k, v in (row.values or {}).items()},
        groupings={k: list(v) for k, v in (row.groupings or {}).items()},
    )


def nutrient_units(session: Session) -> dict[str, str]:
    rows = session.execute(
        select(NutrientDefinition.key, NutrientDefinition.unit)
        .where(NutrientDefinition.kind != "amino_acid")
        .order_by(NutrientDefinition.sort_order, NutrientDefinition.key)
    ).all()
    return {k: u for k, u in rows}


def replace_nutrients(ing: Ingredient, rows: Sequence[dict[str, Any]]) -> None:
    """Make ``ing.nutrients`` equal ``rows`` (dicts with key/value/unit/flag/range_*), updating
    existing rows in place so unique (ingredient, nutrient) constraints never collide."""
    existing = {n.nutrient_key: n for n in ing.nutrients}
    wanted = {r["key"]: r for r in rows}
    for key, n in list(existing.items()):
        if key not in wanted:
            ing.nutrients.remove(n)
    for key, r in wanted.items():
        found = existing.get(key)
        if found is None:
            n = IngredientNutrient(nutrient_key=key, unit=r["unit"])
            ing.nutrients.append(n)
        else:
            n = found
        n.value = r.get("value")
        n.unit = r["unit"]
        n.flag = r.get("flag", "analytical")
        n.range_low = r.get("range_low")
        n.range_high = r.get("range_high")
        n.per_basis = r.get("per_basis", "per_100g_as_is")
