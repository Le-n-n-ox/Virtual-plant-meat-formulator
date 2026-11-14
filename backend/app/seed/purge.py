"""Remove demo, smoke-test and fake records so the database holds only real data.

Usage:
    python -m app.seed.purge                 # smoke-test / fake-marked records only
    python -m app.seed.purge --all-activity  # also every formulation, job, candidate,
                                             # import, audit row and retired model
    add --dry-run to report counts without deleting.

Real reference data is always kept: KFCT ingredients, nutrient definitions, amino-acid
patterns, literature experiments/samples/measurements, data sources in use, user
accounts (other than smoke-test accounts) and non-retired models.

On PostgreSQL the insert-only triggers on formulation_versions and job_events are
disabled only inside this transaction, then re-enabled.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from sqlalchemy import ColumnElement, delete, or_, select
from sqlalchemy.orm import Session

from app.db.models import (
    AuditLog,
    Candidate,
    DataSource,
    Experiment,
    Formulation,
    FormulationVersion,
    Ingredient,
    IngredientImport,
    Job,
    JobEvent,
    JobResult,
    Measurement,
    ModelRegistry,
    Profile,
    Sample,
)

SMOKE_EMAIL = "smoke%@vpmf.local"
SMOKE_INGREDIENT_NAMES = ("Smoke bean%", "[SMOKE]%", "[DEV FAKE]%")
SMOKE_FORMULATION_NAMES = ("Smoke blend%", "Promoted smoke%")
SMOKE_SOURCES = ("src_smoke-lab", "dev-fake")
IMMUTABLE_TRIGGERS = (
    ("formulation_versions", "formulation_versions_insert_only"),
    ("job_events", "job_events_insert_only"),
)


def _ids(session: Session, stmt: Any) -> list[Any]:
    return list(session.scalars(stmt).all())


def purge_demo(session: Session, *, all_activity: bool = False) -> dict[str, int]:
    """Delete demo records in FK-safe order. Caller commits (or rolls back for dry runs)."""
    counts: dict[str, int] = {}
    postgres = session.get_bind().dialect.name == "postgresql"
    if postgres:
        for table, trigger in IMMUTABLE_TRIGGERS:
            session.execute(_text(f"ALTER TABLE {table} DISABLE TRIGGER {trigger}"))

    smoke_users = _ids(session, select(Profile.user_id).where(Profile.email.like(SMOKE_EMAIL)))
    if all_activity:
        formulation_ids = _ids(session, select(Formulation.id))
        job_ids = _ids(session, select(Job.id))
    else:
        formulation_ids = _ids(
            session,
            select(Formulation.id).where(
                or_(
                    *[Formulation.name.like(n) for n in SMOKE_FORMULATION_NAMES],
                    Formulation.owner_id.in_(smoke_users),
                )
            ),
        )
        job_ids = _ids(
            session,
            select(Job.id).where(
                or_(Job.formulation_id.in_(formulation_ids), Job.created_by.in_(smoke_users))
            ),
        )

    def run(name: str, stmt: Any) -> None:
        result: Any = session.execute(stmt)
        counts[name] = counts.get(name, 0) + (result.rowcount or 0)

    # Candidates may point at formulations through promoted_formulation_id as well.
    run(
        "candidates",
        delete(Candidate).where(
            or_(
                Candidate.job_id.in_(job_ids),
                Candidate.formulation_id.in_(formulation_ids),
                Candidate.promoted_formulation_id.in_(formulation_ids),
            )
        ),
    )
    run("job_results", delete(JobResult).where(JobResult.job_id.in_(job_ids)))
    run("job_events", delete(JobEvent).where(JobEvent.job_id.in_(job_ids)))
    run("jobs", delete(Job).where(Job.id.in_(job_ids)))
    run(
        "formulation_versions",
        delete(FormulationVersion).where(FormulationVersion.formulation_id.in_(formulation_ids)),
    )
    run("formulations", delete(Formulation).where(Formulation.id.in_(formulation_ids)))

    # Smoke-test / fake ingredients (nutrients and prices cascade).
    fake_ingredients = _ids(
        session,
        select(Ingredient.id).where(
            or_(
                Ingredient.is_fake.is_(True),
                Ingredient.source_id.in_(SMOKE_SOURCES),
                *[Ingredient.common_name.like(n) for n in SMOKE_INGREDIENT_NAMES],
            )
        ),
    )
    for ing in session.scalars(select(Ingredient).where(Ingredient.id.in_(fake_ingredients))):
        session.delete(ing)
    counts["ingredients"] = len(fake_ingredients)

    # Experiments that are not literature-sourced (smoke tests, manual demo entries).
    exp_filter: ColumnElement[bool] = Experiment.name.like("Smoke%")
    if all_activity:
        exp_filter = or_(exp_filter, Experiment.source_id.is_(None))
    experiment_ids = _ids(session, select(Experiment.id).where(exp_filter))
    sample_ids = _ids(session, select(Sample.id).where(Sample.experiment_id.in_(experiment_ids)))
    run(
        "measurements",
        delete(Measurement).where(
            or_(Measurement.sample_id.in_(sample_ids), Measurement.source_type == "synthetic")
        ),
    )
    run("samples", delete(Sample).where(Sample.id.in_(sample_ids)))
    run("experiments", delete(Experiment).where(Experiment.id.in_(experiment_ids)))

    import_filter: ColumnElement[bool] = IngredientImport.created_by.in_(smoke_users)
    if all_activity:
        import_filter = or_(import_filter, IngredientImport.id.is_not(None))
    run("ingredient_imports", delete(IngredientImport).where(import_filter))

    if all_activity:
        retired = session.scalars(
            select(ModelRegistry).where(ModelRegistry.status == "retired")
        ).all()
        for model in retired:
            if model.artifact_uri:
                Path(model.artifact_uri).unlink(missing_ok=True)
            session.delete(model)
        counts["retired_models"] = len(retired)
        run("audit_log", delete(AuditLog))
    else:
        run("audit_log", delete(AuditLog).where(AuditLog.actor_id.in_(smoke_users)))

    session.flush()
    # Unused smoke/fake data sources.
    used = set(_ids(session, select(Ingredient.source_id).where(Ingredient.source_id.is_not(None))))
    removable = [s for s in SMOKE_SOURCES if s not in used]
    run("data_sources", delete(DataSource).where(DataSource.id.in_(removable)))
    run("profiles", delete(Profile).where(Profile.user_id.in_(smoke_users)))

    if postgres:
        for table, trigger in IMMUTABLE_TRIGGERS:
            session.execute(_text(f"ALTER TABLE {table} ENABLE TRIGGER {trigger}"))
    return counts


def _text(sql: str) -> Any:
    from sqlalchemy import text

    return text(sql)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.seed.purge", description=__doc__)
    parser.add_argument("--all-activity", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    from app.config import get_settings
    from app.db.session import SessionLocal

    if get_settings().env == "production" and args.all_activity:
        parser.error("--all-activity is refused when ENV=production")
    with SessionLocal() as session:
        counts = purge_demo(session, all_activity=args.all_activity)
        if args.dry_run:
            session.rollback()
        else:
            session.commit()
    print(json.dumps({"dry_run": args.dry_run, "deleted": counts}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
