from decimal import Decimal

import numpy as np
import pytest
from app.api.errors import ApiError
from app.config import get_settings
from app.domain.texture.applicability_domain import check_domain
from app.domain.texture.features import (
    build_feature_vector,
    composition_from_blend,
    default_feature_schema,
)
from app.domain.types import ProcessConditions
from app.mlops.registry import approve_model, register_outcome
from app.services.texture import TextureService


def test_blend_mapping_and_no_imputation():
    comp = composition_from_blend(
        {"protein": Decimal("20"), "water": 10, "carbohydrate_available": 50, "fibre": None}
    )
    assert comp["moisture"] == 10 and comp["carbs"] == 50 and comp["fiber"] is None
    assert comp["fat"] is None  # absent is not zero
    x, missing = build_feature_vector(comp, ProcessConditions(), default_feature_schema())
    assert set(missing) == {"ash", "fat", "fiber", "target_moisture"}
    assert np.isnan(x).sum() == 4
    x, missing = build_feature_vector(
        {**comp, "ash": 1, "fat": 1, "fiber": 2},
        ProcessConditions(moisture_percent=55),
        default_feature_schema(),
    )
    assert missing == [] and x.shape == (1, 7)


def test_domain_in_and_out(hardness_outcome, dataset):
    dom = hardness_outcome.applicability_domain
    row = dataset.X.to_numpy()[0]
    assert check_domain(row, dom).in_domain
    far = np.array([20, 10, 3, 50, 2, 12, 55.0])
    res = check_domain(far, dom)
    assert not res.in_domain and res.violations and res.nearest_groups
    assert res.to_dict()["threshold"] == dom["distance_threshold"]


@pytest.fixture()
def approved(db, users, hardness_outcome, dataset, tmp_path):
    row = register_outcome(
        db,
        hardness_outcome,
        target="hardness",
        dataset_version=dataset.dataset_version,
        artifact_dir=str(tmp_path),
        training_sources=dataset.sources,
    )
    approve_model(db, row.id, "usr_admin")
    return row


def test_service_model_unavailable(db):
    svc = TextureService(db, get_settings())
    with pytest.raises(ApiError) as e:
        svc.predict({}, ProcessConditions(moisture_percent=55), ["hardness"])
    assert e.value.code == "model_unavailable" and e.value.details["targets"] == ["hardness"]


def test_service_predictions(db, approved, dataset):
    svc = TextureService(db, get_settings())
    names = ["protein", "moisture", "ash", "carbs", "fat", "fiber"]
    train = dict(zip(names, dataset.X.iloc[0][names], strict=True))
    proc = ProcessConditions(moisture_percent=float(dataset.X.iloc[0]["target_moisture"]))
    out = svc.predict(train, proc, ["hardness"])
    p = out["predictions"][0]
    assert p["in_domain"] and p["evidence_basis"] == "literature_derived_estimate"
    assert p["interval"][0] <= p["value"] <= p["interval"][1] and not out["warnings"]
    kenyan = {
        "protein": 20,
        "water": 10,
        "ash": 3,
        "carbohydrate_available": 50,
        "fat": 2,
        "fibre": 12,
    }
    out = svc.predict(kenyan, ProcessConditions(moisture_percent=55), ["hardness"])
    assert out["predictions"][0]["in_domain"] is False
    assert out["warnings"][0]["code"] == "out_of_domain"
    out = svc.predict({"protein": 20}, ProcessConditions(), ["hardness"])
    assert "value" not in out["predictions"][0]
    assert out["warnings"][0]["code"] == "missing_features"
    fn = svc.predictor_fn("hardness", proc)
    assert isinstance(fn(train), float)
