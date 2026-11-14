"""SQLAlchemy models for every table in backend guide section 4.

Percentages and nutrient values use NUMERIC (Decimal) columns. JSON columns use
JSONB on PostgreSQL and JSON elsewhere (SQLite in tests).
"""

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from app.core.ids import utcnow

JsonType = JSON().with_variant(JSONB(), "postgresql")
Num = Numeric(18, 6)


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class UpdatedMixin(TimestampMixin):
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


# --------------------------------------------------------------------------- reference data


class DataSource(TimestampMixin, Base):
    __tablename__ = "data_sources"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    citation: Mapped[str | None] = mapped_column(Text)
    url: Mapped[str | None] = mapped_column(Text)
    version: Mapped[str | None] = mapped_column(String(64))
    retrieved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # open | permission_granted | restricted | unknown
    license_status: Mapped[str] = mapped_column(String(32), default="unknown")
    license_notes: Mapped[str | None] = mapped_column(Text)


class NutrientDefinition(TimestampMixin, Base):
    __tablename__ = "nutrient_definitions"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    unit: Mapped[str] = mapped_column(String(16))
    # proximate | mineral | vitamin | amino_acid | energy | other
    kind: Mapped[str] = mapped_column(String(32))
    infoods_tagname: Mapped[str | None] = mapped_column(String(32))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class Ingredient(UpdatedMixin, Base):
    __tablename__ = "ingredients"
    __table_args__ = (
        Index("ix_ingredients_crop", "crop"),
        Index("ix_ingredients_form", "form"),
        Index("ix_ingredients_status", "status"),
    )

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    scientific_name: Mapped[str | None] = mapped_column(String(255))
    common_name: Mapped[str] = mapped_column(String(255))
    variety: Mapped[str | None] = mapped_column(String(255))
    form: Mapped[str] = mapped_column(String(64))
    crop: Mapped[str | None] = mapped_column(String(128))
    food_group: Mapped[str | None] = mapped_column(String(128))
    origin: Mapped[str | None] = mapped_column(String(128))
    # as_is | dry
    moisture_basis: Mapped[str] = mapped_column(String(16), default="as_is")
    moisture_percent: Mapped[Decimal | None] = mapped_column(Num)
    edible_portion_percent: Mapped[Decimal | None] = mapped_column(Num)
    source_id: Mapped[str | None] = mapped_column(ForeignKey("data_sources.id"))
    source_row_ref: Mapped[str | None] = mapped_column(String(128))
    method: Mapped[str | None] = mapped_column(Text)
    analysed_on: Mapped[str | None] = mapped_column(String(32))
    # analytical | estimated | external_match | dev_fake
    quality_flag: Mapped[str | None] = mapped_column(String(32))
    # active | draft | retired
    status: Mapped[str] = mapped_column(String(16), default="active")
    dataset_version: Mapped[str] = mapped_column(String(32), default="dev")
    is_fake: Mapped[bool] = mapped_column(Boolean, default=False)

    source: Mapped[DataSource | None] = relationship(lazy="joined")
    nutrients: Mapped[list[IngredientNutrient]] = relationship(
        back_populates="ingredient", cascade="all, delete-orphan", lazy="selectin"
    )
    functional_properties: Mapped[list[IngredientFunctionalProperty]] = relationship(
        cascade="all, delete-orphan", lazy="selectin"
    )
    prices: Mapped[list[IngredientPrice]] = relationship(
        cascade="all, delete-orphan", lazy="selectin", order_by="IngredientPrice.as_of.desc()"
    )


class IngredientNutrient(Base):
    __tablename__ = "ingredient_nutrients"
    __table_args__ = (UniqueConstraint("ingredient_id", "nutrient_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ingredient_id: Mapped[str] = mapped_column(
        ForeignKey("ingredients.id", ondelete="CASCADE"), index=True
    )
    nutrient_key: Mapped[str] = mapped_column(ForeignKey("nutrient_definitions.key"))
    value: Mapped[Decimal | None] = mapped_column(Num)  # NULL = not reported, never zero
    unit: Mapped[str] = mapped_column(String(16))
    flag: Mapped[str] = mapped_column(String(16), default="analytical")  # analytical | estimated
    range_low: Mapped[Decimal | None] = mapped_column(Num)
    range_high: Mapped[Decimal | None] = mapped_column(Num)
    per_basis: Mapped[str] = mapped_column(String(32), default="per_100g_as_is")

    ingredient: Mapped[Ingredient] = relationship(back_populates="nutrients")


class IngredientFunctionalProperty(TimestampMixin, Base):
    __tablename__ = "ingredient_functional_properties"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ingredient_id: Mapped[str] = mapped_column(
        ForeignKey("ingredients.id", ondelete="CASCADE"), index=True
    )
    property: Mapped[str] = mapped_column(String(64))
    value: Mapped[Decimal] = mapped_column(Num)
    unit: Mapped[str] = mapped_column(String(32))
    method: Mapped[str | None] = mapped_column(Text)
    source_id: Mapped[str | None] = mapped_column(ForeignKey("data_sources.id"))


class IngredientPrice(TimestampMixin, Base):
    __tablename__ = "ingredient_prices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ingredient_id: Mapped[str] = mapped_column(
        ForeignKey("ingredients.id", ondelete="CASCADE"), index=True
    )
    price_per_kg: Mapped[Decimal] = mapped_column(Num)
    currency: Mapped[str] = mapped_column(String(8))
    as_of: Mapped[str] = mapped_column(String(32))
    source: Mapped[str | None] = mapped_column(Text)


class AminoAcidReferencePattern(TimestampMixin, Base):
    __tablename__ = "amino_acid_reference_patterns"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    version: Mapped[str] = mapped_column(String(64))
    citation: Mapped[str | None] = mapped_column(Text)
    # {"lysine": 48, "sulfur_amino_acids": 23, ...} mg per g protein
    values: Mapped[dict[str, Any]] = mapped_column(JsonType)
    # {"sulfur_amino_acids": ["methionine", "cysteine"], ...}
    groupings: Mapped[dict[str, Any]] = mapped_column(JsonType, default=dict)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)


# --------------------------------------------------------------------------- users, formulations


class Profile(TimestampMixin, Base):
    __tablename__ = "profiles"

    user_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True)
    display_name: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(
        String(16), default="viewer"
    )  # viewer|scientist|curator|admin
    password_hash: Mapped[str | None] = mapped_column(String(255))  # local auth mode only
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Formulation(UpdatedMixin, Base):
    __tablename__ = "formulations"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("profiles.user_id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    current_version: Mapped[int] = mapped_column(Integer, default=0)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)


class FormulationVersion(TimestampMixin, Base):
    """Immutable. Insert-only (enforced by a PostgreSQL trigger and the service layer)."""

    __tablename__ = "formulation_versions"
    __table_args__ = (UniqueConstraint("formulation_id", "version"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    formulation_id: Mapped[str] = mapped_column(ForeignKey("formulations.id"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(255))
    # [{"ingredient_id": "ing_...", "percent": "41.5"}] (percent stored as a decimal string)
    lines: Mapped[list[dict[str, Any]]] = mapped_column(JsonType)
    targets: Mapped[dict[str, Any] | None] = mapped_column(JsonType)
    note: Mapped[str | None] = mapped_column(Text)
    content_hash: Mapped[str] = mapped_column(String(64))
    created_by: Mapped[str] = mapped_column(ForeignKey("profiles.user_id"))


# --------------------------------------------------------------------------- jobs and results


class Job(TimestampMixin, Base):
    __tablename__ = "jobs"
    __table_args__ = (
        Index("ix_jobs_formulation_status_created", "formulation_id", "status", "created_at"),
        UniqueConstraint("created_by", "idempotency_key"),
    )

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    formulation_id: Mapped[str | None] = mapped_column(ForeignKey("formulations.id"))
    formulation_version: Mapped[int | None] = mapped_column(Integer)
    # nutrition | texture_prediction | optimization | model_training
    type: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(16), default="queued")
    params: Mapped[dict[str, Any]] = mapped_column(JsonType, default=dict)
    stage: Mapped[str | None] = mapped_column(String(64))
    stage_label: Mapped[str | None] = mapped_column(String(255))
    progress_percent: Mapped[int | None] = mapped_column(Integer)
    message: Mapped[str | None] = mapped_column(Text)
    error_code: Mapped[str | None] = mapped_column(String(64))
    error_message: Mapped[str | None] = mapped_column(Text)
    error_details: Mapped[dict[str, Any] | None] = mapped_column(JsonType)
    cancel_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[str] = mapped_column(ForeignKey("profiles.user_id"), index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    data_versions: Mapped[dict[str, Any]] = mapped_column(JsonType, default=dict)
    model_ids: Mapped[list[str]] = mapped_column(JsonType, default=list)
    calc_version: Mapped[str | None] = mapped_column(String(64))
    seed: Mapped[int | None] = mapped_column(Integer)
    idempotency_key: Mapped[str | None] = mapped_column(String(255))
    last_event_seq: Mapped[int] = mapped_column(Integer, default=0)


class JobEvent(Base):
    """Append-only. ``seq`` is gapless and monotonic per job."""

    __tablename__ = "job_events"
    __table_args__ = (
        UniqueConstraint("job_id", "seq"),
        Index("ix_job_events_job_seq", "job_id", "seq"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id"))
    seq: Mapped[int] = mapped_column(Integer)
    event: Mapped[str] = mapped_column(String(32))
    payload: Mapped[dict[str, Any]] = mapped_column(JsonType)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class JobResult(TimestampMixin, Base):
    __tablename__ = "job_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id"), unique=True)
    kind: Mapped[str] = mapped_column(
        String(32)
    )  # nutrition | texture | optimization | model_training
    payload: Mapped[dict[str, Any]] = mapped_column(JsonType)


class Candidate(TimestampMixin, Base):
    __tablename__ = "candidates"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id"), index=True)
    formulation_id: Mapped[str] = mapped_column(ForeignKey("formulations.id"), index=True)
    rank: Mapped[int] = mapped_column(Integer)
    lines: Mapped[list[dict[str, Any]]] = mapped_column(JsonType)
    metrics: Mapped[dict[str, Any]] = mapped_column(JsonType, default=dict)
    predictions: Mapped[list[dict[str, Any]]] = mapped_column(JsonType, default=list)
    model_ids: Mapped[list[str]] = mapped_column(JsonType, default=list)
    warnings: Mapped[list[dict[str, Any]]] = mapped_column(JsonType, default=list)
    scene: Mapped[dict[str, Any]] = mapped_column(JsonType, default=dict)
    cost: Mapped[Decimal | None] = mapped_column(Num)
    pareto: Mapped[bool] = mapped_column(Boolean, default=False)
    from_cancelled_job: Mapped[bool] = mapped_column(Boolean, default=False)
    promoted_formulation_id: Mapped[str | None] = mapped_column(ForeignKey("formulations.id"))


# --------------------------------------------------------------------------- experiments and models


class Experiment(TimestampMixin, Base):
    __tablename__ = "experiments"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    lab: Mapped[str | None] = mapped_column(String(255))
    operator: Mapped[str | None] = mapped_column(String(255))
    run_on: Mapped[str | None] = mapped_column(String(32))
    notes: Mapped[str | None] = mapped_column(Text)
    source_id: Mapped[str | None] = mapped_column(ForeignKey("data_sources.id"))


class Sample(TimestampMixin, Base):
    __tablename__ = "samples"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    experiment_id: Mapped[str] = mapped_column(ForeignKey("experiments.id"), index=True)
    lines: Mapped[list[dict[str, Any]]] = mapped_column(JsonType, default=list)
    # Blend composition when individual ingredient lines are not reported (literature rows)
    composition: Mapped[dict[str, Any]] = mapped_column(JsonType, default=dict)
    process: Mapped[dict[str, Any]] = mapped_column(JsonType, default=dict)
    regime: Mapped[str] = mapped_column(String(64), default="high_moisture_extrusion")
    group_id: Mapped[str | None] = mapped_column(String(64))
    ingredient_dataset_version: Mapped[str | None] = mapped_column(String(32))


class Measurement(TimestampMixin, Base):
    __tablename__ = "measurements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sample_id: Mapped[str] = mapped_column(ForeignKey("samples.id"), index=True)
    property: Mapped[str] = mapped_column(String(64))
    value: Mapped[Decimal] = mapped_column(Num)
    unit: Mapped[str] = mapped_column(String(32))
    method: Mapped[str | None] = mapped_column(Text)
    instrument: Mapped[str | None] = mapped_column(String(255))
    replicates: Mapped[int | None] = mapped_column(Integer)
    sd: Mapped[Decimal | None] = mapped_column(Num)
    tested_on: Mapped[str | None] = mapped_column(String(32))
    # measured | published | synthetic (synthetic is never used for training)
    source_type: Mapped[str] = mapped_column(String(16))


class ModelRegistry(TimestampMixin, Base):
    __tablename__ = "model_registry"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    target: Mapped[str] = mapped_column(String(64), index=True)
    unit: Mapped[str] = mapped_column(String(32))
    algorithm: Mapped[str] = mapped_column(String(64))
    version: Mapped[str] = mapped_column(String(32))
    mlflow_run_id: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(
        String(16), default="candidate"
    )  # candidate|approved|retired
    training_set_size: Mapped[int] = mapped_column(Integer)
    holdout_metrics: Mapped[dict[str, Any]] = mapped_column(JsonType, default=dict)
    feature_schema: Mapped[dict[str, Any]] = mapped_column(JsonType, default=dict)
    applicability_domain: Mapped[dict[str, Any]] = mapped_column(JsonType, default=dict)
    limitations: Mapped[str | None] = mapped_column(Text)
    dataset_version: Mapped[str | None] = mapped_column(String(64))
    artifact_uri: Mapped[str | None] = mapped_column(Text)
    interval_level: Mapped[Decimal | None] = mapped_column(Num)
    training_sources: Mapped[list[dict[str, Any]]] = mapped_column(JsonType, default=list)
    is_test_model: Mapped[bool] = mapped_column(Boolean, default=False)
    approved_by: Mapped[str | None] = mapped_column(ForeignKey("profiles.user_id"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor_id: Mapped[str | None] = mapped_column(String(64), index=True)
    action: Mapped[str] = mapped_column(String(64))
    entity: Mapped[str] = mapped_column(String(64))
    entity_id: Mapped[str | None] = mapped_column(String(64))
    payload: Mapped[dict[str, Any]] = mapped_column(JsonType, default=dict)
    request_id: Mapped[str | None] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class IngredientImport(TimestampMixin, Base):
    """Staged CSV import awaiting curator review; nothing is written until commit."""

    __tablename__ = "ingredient_imports"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("profiles.user_id"))
    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending|committed|rejected
    report: Mapped[dict[str, Any]] = mapped_column(JsonType, default=dict)
    rows: Mapped[list[dict[str, Any]]] = mapped_column(JsonType, default=list)
    dataset_version: Mapped[str | None] = mapped_column(String(32))


__all__ = [
    "AminoAcidReferencePattern",
    "AuditLog",
    "Base",
    "Candidate",
    "DataSource",
    "Experiment",
    "Formulation",
    "FormulationVersion",
    "Ingredient",
    "IngredientFunctionalProperty",
    "IngredientImport",
    "IngredientNutrient",
    "IngredientPrice",
    "Job",
    "JobEvent",
    "JobResult",
    "Measurement",
    "ModelRegistry",
    "NutrientDefinition",
    "Profile",
    "Sample",
]
