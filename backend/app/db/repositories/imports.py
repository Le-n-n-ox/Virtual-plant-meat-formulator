"""Ingredient CSV import: staged validation report (guide 9) and the commit transaction."""

import csv
import io
import re
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.errors import ApiError
from app.core.ids import new_id
from app.db.models import (
    DataSource,
    Ingredient,
    IngredientImport,
    NutrientDefinition,
)
from app.db.repositories.ingredients import replace_nutrients
from app.schemas.common import convert_unit, normalise_unit

REQUIRED_COLUMNS = (
    "common_name",
    "scientific_name",
    "form",
    "moisture_basis",
    "moisture_percent",
    "nutrient_key",
    "value",
    "unit",
    "flag",
    "source_name",
    "license_status",
)
LICENSE_STATUSES = ("open", "permission_granted", "restricted", "unknown")
BLOCKING_LICENSES = ("unknown", "restricted")
PROXIMATE_SUM_KEYS = ("water", "protein", "fat", "carbohydrate_available", "ash")
PROXIMATE_TOLERANCE = Decimal(5)
MAX_ROWS = 50_000


def next_dataset_version(session: Session) -> str:
    """``YYYY.MM.n`` where n is one more than the highest n already used this month."""
    prefix = datetime.now(UTC).strftime("%Y.%m")
    existing = session.scalars(
        select(Ingredient.dataset_version)
        .where(Ingredient.dataset_version.like(f"{prefix}.%"))
        .distinct()
    ).all()
    highest = 0
    for version in existing:
        tail = version.rsplit(".", 1)[-1]
        if tail.isdigit():
            highest = max(highest, int(tail))
    return f"{prefix}.{highest + 1}"


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:50] or "source"


def prepare_nutrients(
    session: Session, rows: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    """Check keys and units against the definitions and convert values to the canonical unit.
    Returns (rows ready to store, errors)."""
    defs = {d.key: d for d in session.scalars(select(NutrientDefinition))}
    ready: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    seen: set[str] = set()
    for row in rows:
        key = row["key"]
        definition = defs.get(key)
        if definition is None:
            errors.append({"code": "unknown_nutrient", "message": f"Unknown nutrient '{key}'."})
            continue
        if key in seen:
            errors.append({"code": "duplicate_nutrient", "message": f"Nutrient '{key}' repeated."})
            continue
        seen.add(key)
        unit = definition.unit
        converted: dict[str, Decimal | None] = {}
        for field in ("value", "range_low", "range_high"):
            raw = row.get(field)
            if raw is None:
                converted[field] = None
                continue
            result = convert_unit(Decimal(str(raw)), row["unit"], unit)
            if result is None:
                errors.append(
                    {
                        "code": "unknown_unit",
                        "message": f"Unit '{row['unit']}' is not convertible to {unit} "
                        f"for '{key}'.",
                    }
                )
                break
            converted[field] = result
        else:
            ready.append(
                {
                    "key": key,
                    "unit": unit,
                    "flag": row.get("flag", "analytical"),
                    "value": converted["value"],
                    "range_low": converted["range_low"],
                    "range_high": converted["range_high"],
                }
            )
    return ready, errors


def _decimal(text: str | None) -> Decimal | None:
    if text is None or not text.strip():
        return None
    try:
        value = Decimal(text.strip())
    except InvalidOperation:
        raise ValueError(text) from None
    if not value.is_finite():
        raise ValueError(text)
    return value


def build_report(
    session: Session, csv_text: str, max_bytes: int
) -> tuple[dict[str, Any], list[Any]]:
    if len(csv_text.encode()) > max_bytes:
        raise ApiError(413, "payload_too_large", "The CSV is larger than the import limit.")
    reader = csv.DictReader(io.StringIO(csv_text))
    header = [h.strip() for h in (reader.fieldnames or [])]
    missing = [c for c in REQUIRED_COLUMNS if c not in header]
    if missing:
        raise ApiError(
            400, "bad_request", "The CSV is missing required columns.", {"missing_columns": missing}
        )
    defs = {d.key: d for d in session.scalars(select(NutrientDefinition))}
    aa_keys = {k for k, d in defs.items() if d.kind == "amino_acid"}
    grouped: dict[tuple[str, ...], dict[str, Any]] = {}
    total_rows = 0
    for line_no, raw in enumerate(reader, start=2):
        total_rows += 1
        if total_rows > MAX_ROWS:
            raise ApiError(413, "payload_too_large", "Too many rows in one import.")
        row = {(k or "").strip(): (v or "").strip() for k, v in raw.items()}
        gkey = tuple(
            row.get(c, "").lower() for c in ("common_name", "form", "variety", "source_name")
        )
        ing = grouped.get(gkey)
        if ing is None:
            ing = {
                "key": "|".join(gkey),
                "common_name": row.get("common_name", ""),
                "scientific_name": row.get("scientific_name", ""),
                "variety": row.get("variety") or None,
                "form": row.get("form", ""),
                "origin": row.get("origin") or None,
                "crop": row.get("crop") or None,
                "moisture_basis": row.get("moisture_basis", ""),
                "moisture_percent": row.get("moisture_percent", ""),
                "source_name": row.get("source_name", ""),
                "method": row.get("method") or None,
                "analysed_on": row.get("analysed_on") or None,
                "license_status": row.get("license_status", ""),
                "nutrients": [],
                "issues": [],
                "first_row": line_no,
            }
            grouped[gkey] = ing
        _check_row(ing, row, line_no, defs)

    ingredients = list(grouped.values())
    for ing in ingredients:
        _check_ingredient(session, ing, aa_keys)
        ing["status"] = (
            "rejected"
            if any(i["level"] == "error" for i in ing["issues"])
            else "flagged"
            if ing["issues"]
            else "ok"
        )
    summary = {
        s: sum(1 for i in ingredients if i["status"] == s) for s in ("ok", "flagged", "rejected")
    }
    blocked = any(
        i["license_status"] in BLOCKING_LICENSES or i["license_status"] not in LICENSE_STATUSES
        for i in ingredients
    )
    report = {
        "rows_total": total_rows,
        "summary": {"ingredients": len(ingredients), **summary},
        "blocked": blocked,
        "can_commit": summary["ok"] + summary["flagged"] > 0,
        "ingredients": [
            {
                "key": i["key"],
                "common_name": i["common_name"],
                "form": i["form"],
                "status": i["status"],
                "issues": i["issues"],
            }
            for i in ingredients
        ],
    }
    return report, ingredients


def _issue(ing: dict[str, Any], level: str, code: str, message: str, row: int | None) -> None:
    ing["issues"].append({"level": level, "code": code, "message": message, "row": row})


def _check_row(
    ing: dict[str, Any], row: dict[str, str], line_no: int, defs: dict[str, NutrientDefinition]
) -> None:
    key = row.get("nutrient_key", "")
    if not key:
        _issue(ing, "error", "missing_field", "nutrient_key is required.", line_no)
        return
    definition = defs.get(key)
    if definition is None:
        _issue(ing, "error", "unknown_nutrient", f"Unknown nutrient '{key}'.", line_no)
        return
    unit_text = row.get("unit", "")
    flag = row.get("flag", "")
    if not unit_text:
        _issue(ing, "error", "missing_field", "unit is required.", line_no)
        return
    if flag not in ("analytical", "estimated"):
        _issue(ing, "error", "invalid_flag", "flag must be analytical or estimated.", line_no)
        return
    try:
        value = _decimal(row.get("value"))
        low = _decimal(row.get("range_low"))
        high = _decimal(row.get("range_high"))
    except ValueError:
        _issue(ing, "error", "invalid_number", f"Non-numeric value for '{key}'.", line_no)
        return
    if value is None:
        _issue(
            ing,
            "warning",
            "value_missing",
            f"'{key}' has no value (stored as not reported).",
            line_no,
        )
    elif value < 0:
        _issue(ing, "error", "negative_value", f"'{key}' is negative.", line_no)
        return
    if convert_unit(Decimal(1), unit_text, definition.unit) is None:
        _issue(
            ing,
            "error",
            "unknown_unit",
            f"Unit '{unit_text}' is unknown or not convertible to {definition.unit}.",
            line_no,
        )
        return
    if any(n["key"] == key for n in ing["nutrients"]):
        _issue(
            ing, "warning", "duplicate_nutrient", f"'{key}' is repeated; first value kept.", line_no
        )
        return
    ing["nutrients"].append(
        {
            "key": key,
            "value": None if value is None else str(value),
            "unit": normalise_unit(unit_text),
            "flag": flag,
            "range_low": None if low is None else str(low),
            "range_high": None if high is None else str(high),
        }
    )


def _check_ingredient(session: Session, ing: dict[str, Any], aa_keys: set[str]) -> None:
    row = ing["first_row"]
    for field in ("common_name", "scientific_name", "form", "source_name"):
        if not ing[field]:
            _issue(ing, "error", "missing_field", f"{field} is required.", row)
    if ing["moisture_basis"] not in ("as_is", "dry"):
        _issue(ing, "error", "invalid_moisture_basis", "moisture_basis must be as_is or dry.", row)
    try:
        moisture = _decimal(ing["moisture_percent"])
    except ValueError:
        moisture = None
        _issue(ing, "error", "invalid_number", "moisture_percent is not a number.", row)
    else:
        if moisture is None:
            _issue(ing, "error", "missing_field", "moisture_percent is required.", row)
        elif not 0 <= moisture <= 100:
            _issue(ing, "error", "out_of_range", "moisture_percent must be 0 to 100.", row)
    license_status = ing["license_status"]
    if license_status not in LICENSE_STATUSES:
        _issue(ing, "error", "invalid_license", "license_status is not recognised.", row)
    elif license_status in BLOCKING_LICENSES:
        _issue(
            ing,
            "error",
            "license_blocked",
            f"Licence status '{license_status}' blocks the import until resolved.",
            row,
        )
    # Converted values for sum checks.
    values: dict[str, Decimal] = {}
    for n in ing["nutrients"]:
        if n["value"] is not None:
            values[n["key"]] = Decimal(n["value"])
    if all(k in values for k in PROXIMATE_SUM_KEYS):
        total = sum(
            (
                convert_unit(values[k], _unit_of(ing, k), "g") or Decimal(0)
                for k in PROXIMATE_SUM_KEYS
            ),
            Decimal(0),
        )
        if abs(total - 100) > PROXIMATE_TOLERANCE:
            _issue(
                ing,
                "warning",
                "proximate_sum",
                f"Proximate composition totals {total} g per 100 g (expected 100 +/- 5).",
                row,
            )
    for n in ing["nutrients"]:
        if n["value"] is None:
            continue
        in_g = convert_unit(Decimal(n["value"]), n["unit"], "g")
        if in_g is not None and in_g > 100:
            _issue(
                ing, "warning", "implausible_value", f"'{n['key']}' exceeds 100 g per 100 g.", row
            )
    protein = values.get("protein")
    aa_total = sum(
        (
            convert_unit(values[k], _unit_of(ing, k), "g") or Decimal(0)
            for k in values
            if k in aa_keys
        ),
        Decimal(0),
    )
    if protein is not None and aa_total > protein * Decimal("1.05"):
        _issue(
            ing,
            "warning",
            "amino_acids_exceed_protein",
            "Amino acids sum to more than the reported protein.",
            row,
        )
    # Duplicate of a stored ingredient (same name, form, variety, source).
    if ing["common_name"] and ing["form"]:
        stmt = (
            select(Ingredient.id)
            .join(DataSource, DataSource.id == Ingredient.source_id)
            .where(
                Ingredient.common_name == ing["common_name"],
                Ingredient.form == ing["form"],
                DataSource.name == ing["source_name"],
            )
        )
        stmt = stmt.where(
            Ingredient.variety == ing["variety"] if ing["variety"] else Ingredient.variety.is_(None)
        )
        existing = session.scalars(stmt.limit(1)).first()
        if existing:
            _issue(
                ing,
                "warning",
                "duplicate_ingredient",
                f"Same name, form, variety and source as {existing}.",
                row,
            )


def _unit_of(ing: dict[str, Any], key: str) -> str:
    return str(next(n["unit"] for n in ing["nutrients"] if n["key"] == key))


def stage_import(session: Session, csv_text: str, user_id: str, max_bytes: int) -> IngredientImport:
    report, ingredients = build_report(session, csv_text, max_bytes)
    row = IngredientImport(
        id=new_id("imp"),
        created_by=user_id,
        status="pending",
        report=report,
        rows=ingredients,
    )
    session.add(row)
    session.flush()
    return row


def commit_import(
    session: Session, staged: IngredientImport, *, include_flagged: bool
) -> tuple[list[str], str]:
    """Write acceptable rows in the caller's transaction; returns (ingredient ids, version)."""
    if staged.status != "pending":
        raise ApiError(409, "conflict", f"This import is already {staged.status}.")
    wanted = {"ok", "flagged"} if include_flagged else {"ok"}
    writable = [r for r in staged.rows if r["status"] in wanted]
    if not writable:
        raise ApiError(
            422,
            "validation_failed",
            "No rows can be committed; resolve the report issues first.",
            {"summary": staged.report.get("summary")},
        )
    dataset_version = next_dataset_version(session)
    created: list[str] = []
    for r in writable:
        source = _upsert_source(session, r)
        nutrients, _errors = prepare_nutrients(
            session,
            [
                {
                    **n,
                    "value": None if n["value"] is None else Decimal(n["value"]),
                    "range_low": None if n["range_low"] is None else Decimal(n["range_low"]),
                    "range_high": None if n["range_high"] is None else Decimal(n["range_high"]),
                }
                for n in r["nutrients"]
            ],
        )
        ing = Ingredient(
            id=new_id("ing"),
            common_name=r["common_name"],
            scientific_name=r["scientific_name"],
            variety=r["variety"],
            form=r["form"],
            crop=r["crop"],
            origin=r["origin"],
            moisture_basis=r["moisture_basis"],
            moisture_percent=Decimal(r["moisture_percent"]),
            source_id=source.id,
            source_row_ref=f"import {staged.id} row {r['first_row']}",
            method=r["method"],
            analysed_on=r["analysed_on"],
            quality_flag=(
                "estimated" if any(n["flag"] == "estimated" for n in nutrients) else "analytical"
            ),
            status="active",
            dataset_version=dataset_version,
            is_fake=False,
        )
        session.add(ing)
        replace_nutrients(ing, nutrients)
        created.append(ing.id)
    staged.status = "committed"
    staged.dataset_version = dataset_version
    session.flush()
    return created, dataset_version


def _upsert_source(session: Session, r: dict[str, Any]) -> DataSource:
    source_id = f"src_{slug(r['source_name'])}"
    source = session.get(DataSource, source_id)
    if source is None:
        source = DataSource(id=source_id, name=r["source_name"], license_status=r["license_status"])
        session.add(source)
        session.flush()
    return source
