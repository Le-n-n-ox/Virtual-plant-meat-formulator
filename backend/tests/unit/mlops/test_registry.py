import pytest
from app.api.errors import ApiError
from app.config import get_settings
from app.mlops import registry
from app.mlops.registry import (
    approve_model,
    ensure_literature_models,
    get_approved_model,
    model_detail,
    model_meta,
    register_outcome,
    retire_model,
)


def _reg(db, outcome, dataset, tmp_path, **kw):
    return register_outcome(
        db,
        outcome,
        target="hardness",
        dataset_version=dataset.dataset_version,
        artifact_dir=str(tmp_path),
        training_sources=dataset.sources,
        **kw,
    )


def test_register_approve_retire(db, users, hardness_outcome, dataset, tmp_path):
    a = _reg(db, hardness_outcome, dataset, tmp_path)
    b = _reg(db, hardness_outcome, dataset, tmp_path)
    assert (a.version, b.version, a.status) == ("1", "2", "candidate")
    assert get_approved_model(db, "hardness") is None
    approve_model(db, a.id, "usr_admin")
    approve_model(db, b.id, "usr_admin")
    assert a.status == "retired" and b.status == "approved"
    assert get_approved_model(db, "hardness").id == b.id
    with pytest.raises(ApiError) as e:
        approve_model(db, a.id, "usr_admin")
    assert e.value.status_code == 409
    retire_model(db, b.id)
    assert get_approved_model(db, "hardness") is None


def test_approval_requires_limitations_and_dataset(db, users, hardness_outcome, dataset, tmp_path):
    row = _reg(db, hardness_outcome, dataset, tmp_path)
    row.limitations = " "
    with pytest.raises(ApiError) as e:
        approve_model(db, row.id, "usr_admin")
    assert e.value.status_code == 422 and "limitations" in e.value.details
    row.limitations = "ok"
    row.dataset_version = None
    with pytest.raises(ApiError):
        approve_model(db, row.id, "usr_admin")


def test_test_model_refused_outside_test_env(
    db, users, hardness_outcome, dataset, tmp_path, monkeypatch
):
    row = _reg(db, hardness_outcome, dataset, tmp_path, is_test_model=True)
    monkeypatch.setattr(
        registry, "get_settings", lambda: get_settings().model_copy(update={"env": "development"})
    )
    with pytest.raises(ApiError) as e:
        approve_model(db, row.id, "usr_admin")
    assert "is_test_model" in e.value.details


def test_meta_detail_and_bootstrap(db, users, tmp_path):
    settings = get_settings().model_copy(update={"model_artifact_dir": str(tmp_path)})
    created = ensure_literature_models(db, settings)
    assert {r.target for r in created} == {"hardness", "chewiness"}
    assert all(r.status == "candidate" for r in created)
    assert ensure_literature_models(db, settings) == []
    meta = model_meta(created[0])
    assert meta["holdout_metric"]["name"] == "rmse" and meta["holdout_metric"]["value"] > 0
    detail = model_detail(created[0])
    assert "training_points" not in detail["applicability_domain"]
    assert detail["limitations"]
