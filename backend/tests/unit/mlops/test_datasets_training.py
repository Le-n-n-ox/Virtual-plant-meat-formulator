import json
import shutil
from pathlib import Path

import numpy as np
import pytest
from app.config import Settings
from app.domain.texture.features import COMPOSITION_FEATURES
from app.mlops.datasets import SyntheticDataError, load_hme_dataset
from app.mlops.training import TrainingCancelled, make_splitter, train_target


def test_dataset_is_hme_only(dataset):
    assert len(dataset.X) == 42
    assert dataset.n_groups == 8
    assert list(dataset.X.columns) == COMPOSITION_FEATURES
    assert dataset.dataset_version.startswith("foodml2023-hme-")


def test_csv_fallback_matches(tmp_path, dataset):
    ref = tmp_path / "reference"
    ref.mkdir()
    src = Path(Settings().data_dir) / "reference" / "foodml_texture_prediction_2023.csv"
    shutil.copy(src, ref / src.name)
    ds = load_hme_dataset(str(tmp_path))
    assert len(ds.X) == 42 and ds.n_groups == 8
    assert np.allclose(sorted(ds.y["hardness"]), sorted(dataset.y["hardness"]))


def test_synthetic_rows_rejected(tmp_path):
    (tmp_path / "processed").mkdir()
    record = {
        "identifiers": {"sample_id": "x", "source_group_id": 1},
        "processing": {"regime": "high_moisture_extrusion"},
        "source_type": "synthetic",
        "values": {},
        "targets": {},
    }
    (tmp_path / "processed" / "foodml_texture_prediction_2023_review.jsonl").write_text(
        json.dumps(record) + "\n"
    )
    with pytest.raises(SyntheticDataError):
        load_hme_dataset(str(tmp_path))


def test_grouped_cv_never_splits_group(dataset):
    splitter, name = make_splitter(dataset.groups)
    assert name == "LeaveOneGroupOut"
    X = dataset.X.to_numpy()
    groups = np.array(dataset.groups)
    for tr, te in splitter.split(X, groups=groups):
        assert not set(groups[tr]) & set(groups[te])


def test_real_training_reproducible_and_reports(dataset, hardness_outcome):
    again = train_target("hardness", dataset, seed=42, min_training_samples=30)
    assert again.holdout_metrics["rmse"] == hardness_outcome.holdout_metrics["rmse"]
    assert again.algorithm == hardness_outcome.algorithm
    chew = train_target("chewiness", dataset, seed=42, min_training_samples=30)
    for o in (hardness_outcome, chew):
        base = o.holdout_metrics["baselines"]["mean_baseline"]["rmse"]["mean"]
        m = o.holdout_metrics
        print(
            f"CV {o.target}: {o.algorithm} rmse {m['rmse']['mean']:.2f}+-{m['rmse']['std']:.2f} "
            f"baseline {base:.2f} coverage {m['coverage_90']:.2f} {o.eligibility}"
        )
        assert o.cv == "LeaveOneGroupOut"
        assert "literature" in o.limitations.lower()
        assert o.candidate_metrics is o.candidates


def test_progress_and_cancel(dataset):
    seen = []
    train_target(
        "hardness",
        dataset,
        seed=1,
        min_training_samples=30,
        progress_cb=lambda d, t: seen.append((d, t)),
    )
    assert seen[-1][0] == seen[-1][1] == 40
    assert len({t for _, t in seen}) == 1
    with pytest.raises(TrainingCancelled):
        train_target("hardness", dataset, seed=1, min_training_samples=30, cancel_cb=lambda: True)
