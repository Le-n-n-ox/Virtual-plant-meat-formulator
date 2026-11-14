"""Back-office request bodies: users, ingredients, imports, experiments."""

from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field

Role = Literal["viewer", "scientist", "curator", "admin"]


class UserCreate(BaseModel):
    email: str = Field(min_length=3, max_length=320, pattern=r"^[^@\s]+@[^@\s]+$")
    display_name: str = Field(min_length=1, max_length=255)
    role: Role
    password: str = Field(min_length=10, max_length=1024)


class UserPatch(BaseModel):
    role: Role | None = None
    active: bool | None = None
    display_name: str | None = Field(default=None, min_length=1, max_length=255)


class NutrientIn(BaseModel):
    key: str = Field(min_length=1, max_length=64)
    value: Decimal | None = Field(default=None, allow_inf_nan=False)
    unit: str = Field(min_length=1, max_length=16)
    flag: Literal["analytical", "estimated"] = "analytical"
    range_low: Decimal | None = Field(default=None, allow_inf_nan=False)
    range_high: Decimal | None = Field(default=None, allow_inf_nan=False)


class FunctionalPropertyIn(BaseModel):
    property: str = Field(min_length=1, max_length=64)
    value: Decimal = Field(allow_inf_nan=False)
    unit: str = Field(min_length=1, max_length=32)
    method: str | None = None


class PriceIn(BaseModel):
    price_per_kg: Decimal = Field(gt=0, allow_inf_nan=False)
    currency: str = Field(min_length=3, max_length=8)
    as_of: str = Field(min_length=4, max_length=32)
    source: str | None = None


class IngredientCreate(BaseModel):
    common_name: str = Field(min_length=1, max_length=255)
    scientific_name: str = Field(min_length=1, max_length=255)
    variety: str | None = Field(default=None, max_length=255)
    form: str = Field(min_length=1, max_length=64)
    crop: str | None = Field(default=None, max_length=128)
    food_group: str | None = Field(default=None, max_length=128)
    origin: str = Field(min_length=1, max_length=128)
    moisture_basis: Literal["as_is", "dry"]
    moisture_percent: Decimal = Field(ge=0, le=100, allow_inf_nan=False)
    edible_portion_percent: Decimal | None = Field(default=None, ge=0, le=100)
    source_id: str = Field(min_length=1, max_length=64)
    source_row_ref: str | None = Field(default=None, max_length=128)
    method: str | None = None
    analysed_on: str | None = Field(default=None, max_length=32)
    quality_flag: Literal["analytical", "estimated", "external_match"] = "analytical"
    status: Literal["active", "draft", "retired"] = "active"
    nutrients: list[NutrientIn] = Field(min_length=1, max_length=200)
    functional_properties: list[FunctionalPropertyIn] = Field(default_factory=list)
    price: PriceIn | None = None


class IngredientUpdate(BaseModel):
    """Partial edit; supplying ``nutrients`` replaces the whole nutrient list."""

    common_name: str | None = Field(default=None, min_length=1, max_length=255)
    scientific_name: str | None = Field(default=None, min_length=1, max_length=255)
    variety: str | None = Field(default=None, max_length=255)
    form: str | None = Field(default=None, min_length=1, max_length=64)
    crop: str | None = Field(default=None, max_length=128)
    food_group: str | None = Field(default=None, max_length=128)
    origin: str | None = Field(default=None, min_length=1, max_length=128)
    moisture_basis: Literal["as_is", "dry"] | None = None
    moisture_percent: Decimal | None = Field(default=None, ge=0, le=100)
    edible_portion_percent: Decimal | None = Field(default=None, ge=0, le=100)
    source_id: str | None = Field(default=None, min_length=1, max_length=64)
    source_row_ref: str | None = Field(default=None, max_length=128)
    method: str | None = None
    analysed_on: str | None = Field(default=None, max_length=32)
    quality_flag: Literal["analytical", "estimated", "external_match"] | None = None
    status: Literal["active", "draft", "retired"] | None = None
    nutrients: list[NutrientIn] | None = Field(default=None, min_length=1, max_length=200)


class ImportCsvIn(BaseModel):
    csv: str = Field(min_length=1)


class ImportCommitIn(BaseModel):
    include_flagged: bool = False


class ExperimentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    lab: str | None = Field(default=None, max_length=255)
    operator: str | None = Field(default=None, max_length=255)
    run_on: str | None = Field(default=None, max_length=32)
    notes: str | None = None
    source_id: str | None = Field(default=None, max_length=64)


class SampleCreate(BaseModel):
    lines: list[dict[str, Any]] = Field(default_factory=list)
    composition: dict[str, Any] = Field(default_factory=dict)
    process: dict[str, Any] = Field(default_factory=dict)
    regime: str = Field(default="high_moisture_extrusion", max_length=64)
    group_id: str | None = Field(default=None, max_length=64)
    ingredient_dataset_version: str | None = Field(default=None, max_length=32)


class MeasurementCreate(BaseModel):
    property: str = Field(min_length=1, max_length=64)
    value: Decimal = Field(allow_inf_nan=False)
    unit: str = Field(min_length=1, max_length=32)
    method: str | None = None
    instrument: str | None = Field(default=None, max_length=255)
    replicates: int | None = Field(default=None, ge=1)
    sd: Decimal | None = Field(default=None, ge=0, allow_inf_nan=False)
    tested_on: str | None = Field(default=None, max_length=32)
    source_type: Literal["measured", "published", "synthetic"]
