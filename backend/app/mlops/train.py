"""Command-line training: ``python -m app.mlops.train --target hardness --seed 42``.

Registers a candidate model. With ``--approve`` an admin approver id and a limitations
statement are applied (the auto-drafted text is used if ``--limitations`` is omitted).
"""

import argparse
import json
import sys
from typing import Any

from app.config import Settings, get_settings
from app.mlops.datasets import load_hme_dataset
from app.mlops.registry import approve_model, register_outcome
from app.mlops.training import TrainingOutcome, train_target


def log_to_mlflow(
    settings: Settings, outcome: TrainingOutcome, dataset_version: str, seed: int
) -> str | None:
    """Optional MLflow logging; returns the run id or None when unavailable."""
    if not settings.mlflow_tracking_uri:
        return None
    try:
        import mlflow  # noqa: PLC0415
    except ImportError:
        return None
    mlflow.set_tracking_uri(settings.mlflow_tracking_uri)
    mlflow.set_experiment(f"texture-{outcome.target}")
    with mlflow.start_run() as run:
        mlflow.set_tags({"dataset_version": dataset_version, "git_sha": settings.git_sha})
        mlflow.log_params({"seed": seed, "algorithm": outcome.algorithm, "cv": outcome.cv})
        rmse = outcome.holdout_metrics["rmse"]["mean"]
        if rmse is not None:
            mlflow.log_metric("cv_rmse", rmse)
        mlflow.log_metric("coverage_90", outcome.holdout_metrics["coverage_90"])
        return str(run.info.run_id)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Train a texture model and register a candidate.")
    parser.add_argument("--target", choices=["hardness", "chewiness"])
    parser.add_argument(
        "--bootstrap",
        action="store_true",
        help="idempotently register literature candidate models for every target (no approval)",
    )
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--approve", action="store_true")
    parser.add_argument("--approver", default=None)
    parser.add_argument("--limitations", default=None)
    args = parser.parse_args(argv)
    if args.bootstrap:
        from app.db.session import SessionLocal  # noqa: PLC0415
        from app.mlops.registry import ensure_literature_models  # noqa: PLC0415

        with SessionLocal() as session:
            rows = ensure_literature_models(session, get_settings())
            session.commit()
            print(json.dumps({"registered_candidates": [r.id for r in rows]}, indent=2))
        return 0
    if not args.target:
        parser.error("--target is required unless --bootstrap is given")
    if args.approve and not args.approver:
        parser.error("--approve requires --approver")

    from app.db.session import SessionLocal  # noqa: PLC0415

    settings = get_settings()
    dataset = load_hme_dataset(settings.data_dir)
    outcome = train_target(
        args.target, dataset, seed=args.seed, min_training_samples=settings.min_training_samples
    )
    if args.limitations:
        outcome.limitations = args.limitations
    run_id = log_to_mlflow(settings, outcome, dataset.dataset_version, args.seed)
    with SessionLocal() as session:
        row = register_outcome(
            session,
            outcome,
            target=args.target,
            dataset_version=dataset.dataset_version,
            artifact_dir=settings.model_artifact_dir,
            training_sources=dataset.sources,
            mlflow_run_id=run_id,
        )
        if args.approve:
            approve_model(session, row.id, args.approver)
        session.commit()
        summary: dict[str, Any] = {
            "model_id": row.id,
            "target": row.target,
            "version": row.version,
            "status": row.status,
            "algorithm": row.algorithm,
            "rmse": outcome.holdout_metrics["rmse"],
            "coverage_90": outcome.holdout_metrics["coverage_90"],
            "eligibility": outcome.eligibility,
        }
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
