"""Helpers shared by job tasks: loading the pinned version, storing results, provenance."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import FormulationVersion, Job, JobResult
from app.domain.types import IngredientData, Line, ProcessConditions
from app.jobs.events import JobFailure


@dataclass
class JobContext:
    job_id: str
    job_type: str
    params: dict[str, Any]
    formulation_id: str | None
    version: int | None
    lines: list[Line]
    targets: dict[str, Any] | None
    ingredients: dict[str, IngredientData]
    seed: int | None


def calc_version(*parts: str) -> str:
    return "+".join([get_settings().git_sha, *parts])


def load_context(
    session: Session, job_id: str, *, extra_ingredient_ids: list[str] | None = None
) -> JobContext:
    from app.db.repositories.ingredients import load_ingredient_data

    job = session.get(Job, job_id)
    if job is None:
        raise JobFailure("not_found", "Job not found.")
    lines: list[Line] = []
    targets = None
    if job.formulation_id is not None:
        row = session.execute(
            select(FormulationVersion).where(
                FormulationVersion.formulation_id == job.formulation_id,
                FormulationVersion.version == job.formulation_version,
            )
        ).scalar_one_or_none()
        if row is None:
            raise JobFailure("not_found", "Pinned formulation version not found.")
        lines = [
            Line(ingredient_id=item["ingredient_id"], percent=Decimal(str(item["percent"])))
            for item in row.lines
        ]
        targets = row.targets
    ids = list(dict.fromkeys([ln.ingredient_id for ln in lines] + (extra_ingredient_ids or [])))
    ingredients = load_ingredient_data(session, ids) if ids else {}
    return JobContext(
        job_id=job.id,
        job_type=job.type,
        params=dict(job.params or {}),
        formulation_id=job.formulation_id,
        version=job.formulation_version,
        lines=lines,
        targets=targets,
        ingredients=ingredients,
        seed=job.seed,
    )


def revalidate(ctx: JobContext) -> None:
    """Re-run the shared validation rules against the pinned version."""
    from app.domain.validation import validate_formulation

    result = validate_formulation(ctx.lines, ctx.ingredients, ctx.targets, new_version=False)
    if not result.valid:
        raise JobFailure(
            "validation_failed",
            "The formulation version is not valid.",
            {"issues": result.to_dict()["issues"]},
        )


def update_job(session: Session, job_id: str, **fields: Any) -> None:
    job = session.get(Job, job_id)
    assert job is not None
    for key, value in fields.items():
        setattr(job, key, value)
    session.commit()


def store_result(session: Session, job_id: str, kind: str, payload: dict[str, Any]) -> None:
    session.add(JobResult(job_id=job_id, kind=kind, payload=payload))
    session.commit()


def parse_process(raw: dict[str, Any] | None) -> ProcessConditions:
    raw = raw or {}
    return ProcessConditions(
        moisture_percent=_num(raw.get("moisture_percent")),
        temperature_profile_c=list(raw.get("temperature_profile_c") or []),
        screw_speed_rpm=_num(raw.get("screw_speed_rpm")),
        feed_rate_kg_h=_num(raw.get("feed_rate_kg_h")),
        cooling=raw.get("cooling"),
    )


def _num(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except TypeError, ValueError:
        return None


def jsonable(value: Any) -> Any:
    """Convert Decimals (and nested containers) into JSON-friendly floats."""
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dict):
        return {k: jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [jsonable(v) for v in value]
    return value
