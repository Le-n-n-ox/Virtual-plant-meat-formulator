"""Shared fixtures: in-memory SQLite database, API client and users for every role.

Tests run with ENV=test and DATABASE_URL=sqlite:// (set by .cache/devrun.sh or below).
"""

import os

os.environ.setdefault("ENV", "test")
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("AUTH_MODE", "local")
import tempfile  # noqa: E402

os.environ.setdefault("MODEL_ARTIFACT_DIR", tempfile.mkdtemp(prefix="vpmf-models-"))

from collections.abc import Iterator  # noqa: E402
from decimal import Decimal  # noqa: E402

import pytest  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.core.security import issue_local_token  # noqa: E402
from app.db import session as db_session  # noqa: E402
from app.db.models import (  # noqa: E402
    Base,
    DataSource,
    Ingredient,
    IngredientNutrient,
    IngredientPrice,
    NutrientDefinition,
    Profile,
)
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

ROLES = ("viewer", "scientist", "curator", "admin")


@pytest.fixture()
def engine():  # type: ignore[no-untyped-def]
    get_settings.cache_clear()
    db_session.get_engine.cache_clear()
    db_session.get_sessionmaker.cache_clear()
    engine = db_session.get_engine()
    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)
    engine.dispose()
    db_session.get_engine.cache_clear()
    db_session.get_sessionmaker.cache_clear()


@pytest.fixture()
def db(engine) -> Iterator[Session]:  # type: ignore[no-untyped-def]
    session = db_session.SessionLocal()
    try:
        yield session
        session.commit()
    finally:
        session.close()


@pytest.fixture()
def users(db: Session) -> dict[str, Profile]:
    created = {}
    for role in ROLES:
        profile = Profile(
            user_id=f"usr_{role}",
            email=f"{role}@example.test",
            display_name=role.title(),
            role=role,
        )
        db.add(profile)
        created[role] = profile
    db.add(
        Profile(
            user_id="usr_other", email="other@example.test", display_name="Other", role="scientist"
        )
    )
    db.commit()
    return created


def auth_header(user_id: str) -> dict[str, str]:
    token, _ = issue_local_token(get_settings(), user_id, f"{user_id}@example.test")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def headers(users: dict[str, Profile]) -> dict[str, dict[str, str]]:
    """``headers["scientist"]`` etc.; ``headers["other"]`` is a second scientist."""
    result = {role: auth_header(f"usr_{role}") for role in ROLES}
    result["other"] = auth_header("usr_other")
    return result


@pytest.fixture()
def client(engine) -> Iterator[TestClient]:  # type: ignore[no-untyped-def]
    from app.api.routers.system import check_dependencies
    from app.main import create_app

    app = create_app()
    app.dependency_overrides[check_dependencies] = lambda: None
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def catalog(db: Session) -> dict[str, Ingredient]:
    """Three clearly fake ingredients with complete proximate + amino-acid rows."""
    nutrient_defs = [
        ("water", "Water", "g", "proximate"),
        ("protein", "Protein", "g", "proximate"),
        ("fat", "Fat", "g", "proximate"),
        ("carbohydrate_available", "Carbohydrate, available", "g", "proximate"),
        ("fibre", "Fibre", "g", "proximate"),
        ("ash", "Ash", "g", "proximate"),
        ("energy_kj", "Energy", "kJ", "energy"),
        ("iron", "Iron", "mg", "mineral"),
        ("vitamin_b12", "Vitamin B12", "ug", "vitamin"),
    ]
    aa = [
        "histidine",
        "isoleucine",
        "leucine",
        "lysine",
        "methionine",
        "cysteine",
        "phenylalanine",
        "tyrosine",
        "threonine",
        "tryptophan",
        "valine",
    ]
    for i, (key, name, unit, kind) in enumerate(nutrient_defs):
        db.add(NutrientDefinition(key=key, name=name, unit=unit, kind=kind, sort_order=i))
    for i, key in enumerate(aa):
        db.add(
            NutrientDefinition(
                key=key, name=key.title(), unit="mg", kind="amino_acid", sort_order=100 + i
            )
        )
    db.add(DataSource(id="src_test", name="Test fixtures (fake)", license_status="open"))
    db.flush()

    rows = {
        "ing_bean": (
            "Fake bean flour",
            "flour",
            "bean",
            {
                "water": 10,
                "protein": 22,
                "fat": 1.5,
                "carbohydrate_available": 50,
                "fibre": 12,
                "ash": 4.5,
                "energy_kj": 1400,
                "iron": 6,
            },
            {
                "lysine": 1500,
                "methionine": 250,
                "cysteine": 200,
                "histidine": 600,
                "isoleucine": 900,
                "leucine": 1700,
                "phenylalanine": 1100,
                "tyrosine": 600,
                "threonine": 850,
                "tryptophan": 250,
                "valine": 1050,
            },
            Decimal("120"),
        ),
        "ing_sorghum": (
            "Fake sorghum flour",
            "flour",
            "sorghum",
            {
                "water": 11,
                "protein": 10,
                "fat": 3,
                "carbohydrate_available": 66,
                "fibre": 7,
                "ash": 3,
                "energy_kj": 1450,
                "iron": 4,
            },
            {
                "lysine": 200,
                "methionine": 170,
                "cysteine": 180,
                "histidine": 220,
                "isoleucine": 400,
                "leucine": 1300,
                "phenylalanine": 500,
                "tyrosine": 300,
                "threonine": 330,
                "tryptophan": 110,
                "valine": 500,
            },
            Decimal("80"),
        ),
        "ing_water": (
            "Water",
            "raw",
            None,
            {
                "water": 100,
                "protein": 0,
                "fat": 0,
                "carbohydrate_available": 0,
                "fibre": 0,
                "ash": 0,
                "energy_kj": 0,
                "iron": 0,
            },
            {k: 0 for k in aa},
            Decimal("1"),
        ),
    }
    created = {}
    for ing_id, (name, form, crop, prox, amino, price) in rows.items():
        ing = Ingredient(
            id=ing_id,
            common_name=name,
            scientific_name=None,
            form=form,
            crop=crop,
            moisture_basis="as_is",
            moisture_percent=Decimal(str(prox["water"])),
            source_id="src_test",
            quality_flag="dev_fake",
            status="active",
            dataset_version="test.1",
            is_fake=True,
        )
        for key, value in {**prox, **amino}.items():
            unit = next((u for k, _n, u, _k in nutrient_defs if k == key), "mg")
            ing.nutrients.append(
                IngredientNutrient(nutrient_key=key, value=Decimal(str(value)), unit=unit)
            )
        ing.prices.append(
            IngredientPrice(price_per_kg=price, currency="KES", as_of="2026-11-01", source="test")
        )
        db.add(ing)
        created[ing_id] = ing
    db.commit()
    return created
