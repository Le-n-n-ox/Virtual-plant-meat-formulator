"""The purge command removes smoke/demo records and keeps real reference data."""

from decimal import Decimal

from app.db.models import (
    AuditLog,
    DataSource,
    Formulation,
    FormulationVersion,
    Ingredient,
    IngredientNutrient,
    Job,
    JobEvent,
    Profile,
)
from app.seed.purge import purge_demo
from sqlalchemy import func, select


def _count(db, model) -> int:  # type: ignore[no-untyped-def]
    return db.scalar(select(func.count()).select_from(model))


def _demo(db) -> None:  # type: ignore[no-untyped-def]
    db.add(Profile(user_id="usr_smoke", email="smoke1@vpmf.local", display_name="S", role="viewer"))
    db.add(DataSource(id="src_smoke-lab", name="Smoke lab", license_status="open"))
    db.flush()
    smoke_ing = Ingredient(
        id="ing_smoke",
        common_name="Smoke bean 1",
        form="flour",
        source_id="src_smoke-lab",
        status="retired",
    )
    smoke_ing.nutrients.append(
        IngredientNutrient(nutrient_key="protein", value=Decimal(1), unit="g")
    )
    db.add(smoke_ing)
    for fid, name in (("frm_smoke", "Smoke blend"), ("frm_real", "My real blend")):
        db.add(Formulation(id=fid, owner_id="usr_scientist", name=name, current_version=1))
        db.flush()
        db.add(
            FormulationVersion(
                formulation_id=fid,
                version=1,
                name=name,
                lines=[],
                content_hash="h",
                created_by="usr_scientist",
            )
        )
        db.add(
            Job(
                id=f"job_{fid}",
                formulation_id=fid,
                formulation_version=1,
                type="nutrition",
                status="completed",
                params={},
                created_by="usr_scientist",
            )
        )
        db.flush()
        db.add(JobEvent(job_id=f"job_{fid}", seq=1, event="job.completed", payload={}))
    db.add(AuditLog(actor_id="usr_smoke", action="x", entity="y", entity_id=None))
    db.add(Ingredient(id="ing_real", common_name="Real cowpea flour", form="flour"))
    db.commit()


def test_purge_smoke_only_keeps_real(db, users, catalog):  # type: ignore[no-untyped-def]
    _demo(db)
    counts = purge_demo(db)
    db.commit()
    assert counts["formulations"] == 1
    assert counts["ingredients"] == 4  # smoke bean + 3 fixture rows flagged is_fake
    assert db.get(Formulation, "frm_real") is not None
    assert db.get(Formulation, "frm_smoke") is None
    assert db.get(Ingredient, "ing_smoke") is None
    assert db.get(Ingredient, "ing_real") is not None  # real catalogue kept
    assert db.get(Ingredient, "ing_bean") is None  # is_fake fixture removed
    assert db.get(Profile, "usr_smoke") is None and db.get(Profile, "usr_scientist")
    assert db.get(DataSource, "src_smoke-lab") is None
    assert _count(db, AuditLog) == 0


def test_purge_all_activity(db, users, catalog):  # type: ignore[no-untyped-def]
    _demo(db)
    purge_demo(db, all_activity=True)
    db.commit()
    assert _count(db, Formulation) == 0 and _count(db, Job) == 0
    assert _count(db, JobEvent) == 0 and _count(db, FormulationVersion) == 0
    assert _count(db, Ingredient) == 1  # only the real ingredient remains
    assert _count(db, Profile) == 5  # real/dev accounts kept, smoke account removed
