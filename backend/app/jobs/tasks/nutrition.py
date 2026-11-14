"""Nutrition job: deterministic weighted-mixture calculation plus amino-acid scoring."""

from __future__ import annotations

from app.db.session import SessionLocal
from app.jobs.events import JobEmitter, JobFailure
from app.jobs.tasks.common import calc_version, load_context, revalidate, store_result, update_job


def run_nutrition(job_id: str, emitter: JobEmitter) -> None:
    from app.db.repositories.ingredients import dataset_versions, get_pattern, nutrient_units
    from app.domain import amino_acids, nutrition
    from app.domain.moisture import BasisError
    from app.domain.units import UnitError

    session = SessionLocal()
    try:
        emitter.stage("validating")
        ctx = load_context(session, job_id)
        revalidate(ctx)

        emitter.stage("loading_ingredients", f"{len(ctx.ingredients)} ingredients")
        units = nutrient_units(session)
        try:
            pattern = get_pattern(session, ctx.params.get("amino_acid_pattern_id"))
        except Exception as exc:  # ApiError from the repository
            raise JobFailure(
                getattr(exc, "code", "validation_failed"),
                getattr(exc, "message", "Amino-acid reference pattern unavailable."),
            ) from exc
        data_versions = dataset_versions(session, [ln.ingredient_id for ln in ctx.lines])
        version = calc_version(nutrition.CALC_VERSION, amino_acids.CALC_VERSION)
        update_job(session, job_id, data_versions=data_versions, calc_version=version)

        emitter.stage("calculating")
        try:
            result = nutrition.calculate_nutrition(ctx.lines, ctx.ingredients, units)
        except (BasisError, UnitError) as exc:
            raise JobFailure(
                "validation_failed",
                "Ingredient units or moisture basis cannot be reconciled.",
                {"issues": [{"code": "unit_or_basis_mismatch", "message": str(exc)}]},
            ) from exc
        missing = [n for n in result.nutrients if n.value is None]
        if missing:
            emitter.warning(
                f"{len(missing)} nutrients are not reported for every ingredient and are shown "
                "as missing, not as partial totals.",
                "missing_data",
                {
                    "nutrients": [n.key for n in missing],
                    "ingredient_ids": sorted(
                        {i for n in missing for i in n.missing_ingredient_ids}
                    ),
                },
            )

        emitter.stage("scoring_amino_acids", f"Reference pattern: {pattern.name}")
        aa = amino_acids.score_amino_acids(ctx.lines, ctx.ingredients, pattern)
        aa_payload = aa.to_payload()
        if not aa_payload.get("complete", False):
            emitter.warning(
                "Amino-acid data is incomplete; the score covers only the available amino acids.",
                "incomplete_amino_acids",
                {"missing": aa_payload.get("missing", [])},
            )

        emitter.stage("storing")
        payload = result.to_payload()
        payload["amino_acids"] = aa_payload
        payload["calc_version"] = version
        payload["data_versions"] = data_versions
        payload["formulation_version"] = ctx.version
        store_result(session, job_id, "nutrition", payload)
        emitter.result_ready()
        emitter.completed()
    finally:
        session.close()
