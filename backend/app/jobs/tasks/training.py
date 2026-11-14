"""Model training job (admin): grouped CV on literature HME data, then register a candidate.

Training never approves a model; approval is a separate admin action after review.
"""

from __future__ import annotations

from app.config import get_settings
from app.db.session import SessionLocal
from app.jobs.events import JobCancelledSignal, JobEmitter, JobFailure
from app.jobs.tasks.common import jsonable, load_context, store_result, update_job


def run_training(job_id: str, emitter: JobEmitter) -> None:
    from app.mlops import datasets, registry, training

    settings = get_settings()
    session = SessionLocal()
    try:
        ctx = load_context(session, job_id)
        target = str(ctx.params.get("target", "hardness"))
        seed = int(ctx.seed or 0)

        emitter.stage("loading_dataset")
        try:
            dataset = datasets.load_hme_dataset(settings.data_dir)
        except datasets.SyntheticDataError as exc:
            raise JobFailure("validation_failed", str(exc)) from exc
        except FileNotFoundError as exc:
            raise JobFailure("missing_ingredient_data", f"Training data not found: {exc}") from exc
        if target not in dataset.y:
            raise JobFailure(
                "validation_failed",
                f"Target {target} is not available in the dataset.",
                {"available": sorted(dataset.y)},
            )
        update_job(session, job_id, data_versions={"training": dataset.dataset_version})

        emitter.stage("cross_validating")

        def _fold_progress(done: int, total: int) -> None:
            emitter.progress(done, total, f"Fold {done} of {total}")

        try:
            outcome = training.train_target(
                target,
                dataset,
                seed=seed,
                min_training_samples=settings.min_training_samples,
                progress_cb=_fold_progress,
                cancel_cb=emitter.cancel_requested,
            )
        except training.TrainingCancelled as exc:
            raise JobCancelledSignal() from exc

        emitter.stage("fitting", f"Selected {outcome.algorithm}")
        emitter.stage("evaluating")
        if not outcome.eligibility.get("eligible", False):
            emitter.warning(
                "The selected model does not meet every approval criterion; it is registered "
                "as a candidate for review only.",
                "not_eligible_for_approval",
                {"eligibility": jsonable(outcome.eligibility)},
            )

        emitter.stage("registering")
        row = registry.register_outcome(
            session,
            outcome,
            target=target,
            dataset_version=dataset.dataset_version,
            artifact_dir=settings.model_artifact_dir,
            training_sources=dataset.sources,
        )
        session.commit()
        update_job(session, job_id, model_ids=[row.id])
        store_result(
            session,
            job_id,
            "model_training",
            jsonable(
                {
                    "model_id": row.id,
                    "target": target,
                    "algorithm": outcome.algorithm,
                    "holdout_metrics": outcome.holdout_metrics,
                    "candidates": outcome.candidate_metrics,
                    "eligibility": outcome.eligibility,
                    "dataset_version": dataset.dataset_version,
                    "status": row.status,
                }
            ),
        )
        emitter.result_ready()
        emitter.completed(f"Registered {row.id} as candidate")
    finally:
        session.close()
