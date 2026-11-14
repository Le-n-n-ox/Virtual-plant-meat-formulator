"""Stale-job recovery, create-only dev users and the protein-ingredient seed."""

from datetime import UTC, datetime, timedelta
from pathlib import Path

from app.config import get_settings
from app.core.ids import new_id
from app.core.security import verify_password
from app.db.models import (
    DataSource,
    Formulation,
    Ingredient,
    Job,
    JobEvent,
    Profile,
)
from app.jobs.recovery import fail_stale_jobs, find_stale_jobs
from app.seed import catalog as seed
from app.seed.protein_ingredients import (
    USDA_REFERENCE,
    seed_literature_materials,
    seed_usda_protein_ingredients,
)
from sqlalchemy import select

NOW = datetime(2026, 11, 14, 12, 0, tzinfo=UTC)


def _job(db, status, *, created, started=None, last_event=None):  # type: ignore[no-untyped-def]
    job = Job(
        id=new_id("job"),
        formulation_id="frm_r",
        formulation_version=1,
        type="optimization",
        status=status,
        params={},
        created_by="usr_scientist",
        created_at=created,
        started_at=started,
    )
    db.add(job)
    db.flush()
    if last_event is not None:
        db.add(
            JobEvent(job_id=job.id, seq=1, event="stage.updated", payload={}, created_at=last_event)
        )
        job.last_event_seq = 1
    db.commit()
    return job.id


def test_stale_jobs_are_failed_and_fresh_ones_kept(client, headers, db, users):  # type: ignore[no-untyped-def]
    db.add(Formulation(id="frm_r", owner_id="usr_scientist", name="r", current_version=1))
    db.commit()
    settings = get_settings()
    old = NOW - timedelta(seconds=settings.job_stale_seconds + 60)
    recent = NOW - timedelta(seconds=30)
    dead = _job(db, "running", created=old, started=old, last_event=old)
    alive = _job(db, "running", created=old, started=old, last_event=recent)
    waiting = _job(db, "queued", created=recent)
    abandoned = _job(
        db, "queued", created=NOW - timedelta(seconds=settings.job_queue_timeout_seconds + 60)
    )

    found = dict(find_stale_jobs(settings, now=NOW))
    assert found == {dead: "worker_lost", abandoned: "never_started"}

    assert sorted(fail_stale_jobs(settings, user_id="usr_scientist", now=NOW)) == sorted(
        [dead, abandoned]
    )
    db.expire_all()
    failed = db.get(Job, dead)
    assert failed.status == "failed" and failed.error_code == "internal_error"
    assert failed.error_details == {"reason": "worker_lost"}
    assert failed.finished_at is not None
    last = (
        db.execute(select(JobEvent).where(JobEvent.job_id == dead).order_by(JobEvent.seq.desc()))
        .scalars()
        .first()
    )
    assert last.event == "job.failed" and last.seq == 2  # gapless, terminal
    assert db.get(Job, alive).status == "running"
    assert db.get(Job, waiting).status == "queued"
    assert fail_stale_jobs(settings, now=NOW) == []  # idempotent


def test_status_endpoint_recovers_a_dead_job(client, headers, db, users):  # type: ignore[no-untyped-def]
    db.add(Formulation(id="frm_r", owner_id="usr_scientist", name="r", current_version=1))
    db.commit()
    long_ago = datetime.now(UTC) - timedelta(hours=3)
    dead = _job(db, "running", created=long_ago, started=long_ago, last_event=long_ago)
    body = client.get(f"/api/jobs/{dead}", headers=headers["scientist"]).json()
    assert body["status"] == "failed"
    assert body["error"]["details"]["reason"] == "worker_lost"
    listing = client.get("/api/jobs?status=running", headers=headers["scientist"]).json()
    assert listing["total"] == 0


def test_dev_users_are_create_only(db):  # type: ignore[no-untyped-def]
    settings = get_settings()
    assert seed.seed_dev_users(db, settings) == 4
    admin = db.scalars(select(Profile).where(Profile.email == "admin@vpmf.local")).one()
    original_hash = admin.password_hash
    admin.active = False
    admin.role = "viewer"
    db.commit()
    assert seed.seed_dev_users(db, settings) == 0
    db.refresh(admin)
    assert admin.active is False and admin.role == "viewer"  # not re-enabled or re-promoted
    assert admin.password_hash == original_hash  # password not reset
    assert verify_password("devpassword123", admin.password_hash)


def test_protein_ingredients_from_reference_files(db, tmp_path):  # type: ignore[no-untyped-def]
    data_dir = Path(get_settings().data_dir)
    assert seed_usda_protein_ingredients(db, tmp_path) == 0  # no reference file -> no rows
    seed.seed_nutrient_definitions(db)
    seed.seed_literature_experiments(db, data_dir)  # registers the FoodML data source
    literature = seed_literature_materials(db, data_dir)
    assert literature == 5
    ypi = db.get(Ingredient, "ing_lit_ypi_com")
    by = {n.nutrient_key: float(n.value) for n in ypi.nutrients}
    assert by == {
        "protein": 79,
        "water": 6,
        "ash": 4,
        "carbohydrate_available": 9.2,
        "fat": 0.2,
        "fibre": 1.6,
    }  # exactly the published values; nothing else
    assert ypi.quality_flag == "external_match" and ypi.is_fake is False

    if not (data_dir / USDA_REFERENCE).exists():
        return
    assert seed_usda_protein_ingredients(db, data_dir) == 5
    spi = db.get(Ingredient, "ing_usda_174276")
    by = {n.nutrient_key: n for n in spi.nutrients}
    assert float(by["protein"].value) == 88.32 and float(by["water"].value) == 4.98
    assert by["lysine"].value == 5327 and by["lysine"].unit == "mg"  # 5.327 g -> mg
    assert by["carbohydrate_available"].flag == "estimated"
    assert spi.quality_flag == "external_match"
    source = db.get(DataSource, "usda-sr-legacy-2018-04")
    assert source.license_status == "open" and "CC0" in source.license_notes
    assert seed_usda_protein_ingredients(db, data_dir) == 5  # idempotent
