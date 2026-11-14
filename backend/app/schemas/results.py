"""Schemas for results, candidates, comparison and promotion."""

from typing import Any

from pydantic import BaseModel, Field


class CandidateLine(BaseModel):
    ingredient_id: str
    percent: float


class CandidateOut(BaseModel):
    id: str
    job_id: str
    formulation_id: str
    rank: int
    pareto: bool
    lines: list[CandidateLine]
    metrics: dict[str, Any]
    predictions: list[dict[str, Any]]
    model_ids: list[str]
    warnings: list[dict[str, Any]]
    scene: dict[str, Any]
    cost: float | None = None
    from_cancelled_job: bool
    promoted_formulation_id: str | None = None
    created_at: str | None = None


class PromoteIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)


class PromotedFormulationOut(BaseModel):
    id: str
    name: str
    description: str | None
    version: int
    current_version: int
    lines: list[dict[str, Any]]
    targets: dict[str, Any] | None
    note: str | None
    content_hash: str
    archived: bool
    owner_id: str
    created_at: str | None
    updated_at: str | None


class Difference(BaseModel):
    metric: str
    unit: str | None
    a: float | None
    b: float | None
    delta: float | None


class CompareOut(BaseModel):
    items: list[CandidateOut]
    differences: list[Difference]
