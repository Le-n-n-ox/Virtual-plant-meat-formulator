"""Formulation request bodies (responses are plain dicts built by the repository)."""

from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field


class LineIn(BaseModel):
    ingredient_id: str = Field(min_length=1, max_length=40)
    percent: Decimal = Field(allow_inf_nan=False)


class FormulationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=5000)
    template_id: str | None = None


class FormulationUpdate(BaseModel):
    base_version: int = Field(ge=0)
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=5000)
    lines: list[LineIn] = Field(max_length=200)
    targets: dict[str, Any] | None = None
    note: str | None = Field(default=None, max_length=2000)


class FormulationPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=5000)
    archived: bool | None = None


class DuplicateIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)


class ValidateIn(BaseModel):
    lines: list[LineIn] = Field(max_length=200)
    targets: dict[str, Any] | None = None


class RestoreIn(BaseModel):
    base_version: int = Field(ge=0)
