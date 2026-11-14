"""Queries and helpers for job results, candidates, comparison and promotion."""

import hashlib
import json
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.errors import ApiError
from app.core.ids import iso, new_id
from app.db.models import (
    Candidate,
    Formulation,
    FormulationVersion,
    Job,
    JobResult,
)


def get_owned_formulation(session: Session, formulation_id: str, user: Any) -> Formulation:
    formulation = session.get(Formulation, formulation_id)
    if formulation is None or formulation.owner_id != user.user_id:
        raise ApiError(404, "not_found", "Formulation not found.")
    return formulation


def get_owned_candidate(session: Session, candidate_id: str, user: Any) -> Candidate:
    candidate = session.get(Candidate, candidate_id)
    if candidate is None:
        raise ApiError(404, "not_found", "Candidate not found.")
    owner = session.scalar(
        select(Formulation.owner_id).where(Formulation.id == candidate.formulation_id)
    )
    if owner != user.user_id:
        raise ApiError(404, "not_found", "Candidate not found.")
    return candidate


def resolve_version(formulation: Formulation, version: int | None) -> int:
    return version if version is not None else formulation.current_version


def latest_completed(
    session: Session, formulation_id: str, job_type: str, version: int
) -> tuple[Job, JobResult] | None:
    """Latest completed job of a type for a formulation version, with its stored result."""
    row = session.execute(
        select(Job, JobResult)
        .join(JobResult, JobResult.job_id == Job.id)
        .where(
            Job.formulation_id == formulation_id,
            Job.type == job_type,
            Job.status == "completed",
            Job.formulation_version == version,
        )
        .order_by(Job.finished_at.desc(), Job.created_at.desc())
        .limit(1)
    ).first()
    if row is None:
        return None
    return row[0], row[1]


def nutrition_payload(
    session: Session, formulation: Formulation, version: int | None
) -> dict[str, Any]:
    ver = resolve_version(formulation, version)
    found = latest_completed(session, formulation.id, "nutrition", ver)
    if found is None:
        raise ApiError(
            404,
            "not_found",
            "No nutrition result for this formulation version.",
            {"hint": "start a nutrition job"},
        )
    job, result = found
    return {
        **result.payload,
        "job_id": job.id,
        "formulation_version": job.formulation_version,
        "finished_at": iso(job.finished_at),
    }


def candidate_payload(candidate: Candidate) -> dict[str, Any]:
    return {
        "id": candidate.id,
        "job_id": candidate.job_id,
        "formulation_id": candidate.formulation_id,
        "rank": candidate.rank,
        "pareto": bool(candidate.pareto),
        "lines": [
            {"ingredient_id": ln["ingredient_id"], "percent": float(ln["percent"])}
            for ln in (candidate.lines or [])
        ],
        "metrics": candidate.metrics or {},
        "predictions": candidate.predictions or [],
        "model_ids": candidate.model_ids or [],
        "warnings": candidate.warnings or [],
        "scene": candidate.scene or {"visual_basis": "illustrative", "variables": []},
        "cost": float(candidate.cost) if candidate.cost is not None else None,
        "from_cancelled_job": bool(candidate.from_cancelled_job),
        "promoted_formulation_id": candidate.promoted_formulation_id,
        "created_at": iso(candidate.created_at),
    }


def list_candidates(
    session: Session,
    formulation_id: str,
    *,
    job_id: str | None,
    pareto: bool | None,
    offset: int,
    limit: int,
) -> tuple[list[Candidate], int]:
    conditions = [Candidate.formulation_id == formulation_id]
    if job_id:
        conditions.append(Candidate.job_id == job_id)
    if pareto:
        conditions.append(Candidate.pareto.is_(True))
    total = session.scalar(select(func.count()).select_from(Candidate).where(*conditions)) or 0
    items = session.scalars(
        select(Candidate)
        .join(Job, Job.id == Candidate.job_id)
        .where(*conditions)
        .order_by(Job.created_at.desc(), Candidate.job_id, Candidate.rank)
        .offset(offset)
        .limit(limit)
    ).all()
    return list(items), total


def _num(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float | Decimal):
        return None
    return float(value)


def _metric_rows(c: dict[str, Any]) -> dict[str, tuple[str | None, float | None]]:
    rows: dict[str, tuple[str | None, float | None]] = {}
    metrics = c["metrics"]
    rows["protein_g_per_100g"] = ("g", _num(metrics.get("protein_g_per_100g")))
    rows["amino_acid_score"] = ("score", _num(metrics.get("amino_acid_score")))
    cost = metrics.get("cost_per_kg")
    if isinstance(cost, dict):
        rows["cost_per_kg.value"] = (cost.get("currency"), _num(cost.get("value")))
    for pred in c["predictions"]:
        if "target" in pred:
            rows[str(pred["target"])] = (pred.get("unit"), _num(pred.get("value")))
    for line in c["lines"]:
        rows[f"percent:{line['ingredient_id']}"] = ("%", _num(line["percent"]))
    return rows


def compare_candidates(a: dict[str, Any], b: dict[str, Any]) -> list[dict[str, Any]]:
    rows_a, rows_b = _metric_rows(a), _metric_rows(b)
    out = []
    for metric in [*rows_a, *(m for m in rows_b if m not in rows_a)]:
        unit_a, va = rows_a.get(metric, (None, None))
        unit_b, vb = rows_b.get(metric, (None, None))
        if metric.startswith("percent:"):
            # An ingredient absent from a candidate is a known 0 %, not missing data.
            unit_a, unit_b = unit_a or "%", unit_b or "%"
            va = 0.0 if metric not in rows_a else va
            vb = 0.0 if metric not in rows_b else vb
        if va is None and vb is None:
            continue
        delta = round(vb - va, 10) if va is not None and vb is not None else None
        out.append({"metric": metric, "unit": unit_a or unit_b, "a": va, "b": vb, "delta": delta})
    return out


def content_hash(lines: list[dict[str, Any]], targets: dict[str, Any] | None) -> str:
    canonical = json.dumps(
        {"lines": lines, "targets": targets}, sort_keys=True, separators=(",", ":")
    )
    return hashlib.sha256(canonical.encode()).hexdigest()


def promote_candidate(
    session: Session, candidate: Candidate, user: Any, name: str | None
) -> dict[str, Any]:
    lines = [
        {"ingredient_id": ln["ingredient_id"], "percent": str(Decimal(str(ln["percent"])))}
        for ln in candidate.lines
    ]
    final_name = name or f"Candidate {candidate.rank} ({candidate.id})"
    note = f"Promoted from candidate {candidate.id}"
    formulation = Formulation(
        id=new_id("frm"), owner_id=user.user_id, name=final_name, current_version=1
    )
    session.add(formulation)
    session.flush()
    digest = content_hash(lines, None)
    session.add(
        FormulationVersion(
            formulation_id=formulation.id,
            version=1,
            name=final_name,
            lines=lines,
            targets=None,
            note=note,
            content_hash=digest,
            created_by=user.user_id,
        )
    )
    candidate.promoted_formulation_id = formulation.id
    session.flush()
    session.refresh(formulation)
    return {
        "id": formulation.id,
        "name": formulation.name,
        "description": formulation.description,
        "version": 1,
        "current_version": 1,
        "lines": lines,
        "targets": None,
        "note": note,
        "content_hash": digest,
        "archived": False,
        "owner_id": formulation.owner_id,
        "created_at": iso(formulation.created_at),
        "updated_at": iso(formulation.updated_at),
    }
