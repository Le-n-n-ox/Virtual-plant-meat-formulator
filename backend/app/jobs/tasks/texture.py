"""Texture prediction job: approved literature-trained models, intervals and domain checks.

No approved model -> model_unavailable (never a default, literature average or LLM guess).
"""

from __future__ import annotations

from typing import Any

from app.config import get_settings
from app.db.session import SessionLocal
from app.jobs.events import JobEmitter, JobFailure
from app.jobs.tasks.common import (
    calc_version,
    jsonable,
    load_context,
    parse_process,
    revalidate,
    store_result,
    update_job,
)


def run_texture(job_id: str, emitter: JobEmitter) -> None:
    from app.api.errors import ApiError
    from app.db.repositories.ingredients import dataset_versions
    from app.domain.nutrition import blend_composition
    from app.domain.texture.features import composition_from_blend
    from app.services.texture import TextureService

    session = SessionLocal()
    try:
        emitter.stage("validating")
        ctx = load_context(session, job_id)
        revalidate(ctx)
        targets: list[str] = list(ctx.params.get("targets") or [])
        process = parse_process(ctx.params.get("process"))
        service = TextureService(session, get_settings())
        try:
            models = service.require_models(targets)
        except ApiError as exc:
            raise JobFailure(exc.code, exc.message, exc.details) from exc

        emitter.stage("building_features")
        blend = blend_composition(ctx.lines, ctx.ingredients)
        composition = composition_from_blend(blend)
        missing = [k for k, v in composition.items() if v is None]
        if missing:
            emitter.warning(
                "Some composition inputs are not reported for every ingredient; affected "
                "targets cannot be predicted.",
                "missing_features",
                {"features": missing},
            )

        emitter.stage("checking_domain")
        model_ids = [m.id for m in models.values()]
        data_versions = dataset_versions(session, [ln.ingredient_id for ln in ctx.lines])
        data_versions.update({f"model:{m.id}": m.dataset_version or "" for m in models.values()})
        update_job(
            session,
            job_id,
            model_ids=model_ids,
            data_versions=data_versions,
            calc_version=calc_version("texture-1.0.0"),
        )

        emitter.stage("predicting")
        outcome: dict[str, Any] = service.predict(composition, process, targets)
        for warning in outcome.get("warnings", []):
            if warning.get("code") == "missing_features":
                continue  # already raised above
            emitter.warning(
                warning.get("message", "Prediction warning"),
                warning.get("code", "warning"),
                warning.get("details") or {},
            )

        emitter.stage("storing")
        payload = {
            "predictions": outcome.get("predictions", []),
            "warnings": outcome.get("warnings", []),
            "process": ctx.params.get("process") or {},
            "composition": jsonable(composition),
            "evidence_basis": "literature_derived_estimate",
            "model_ids": model_ids,
            "data_versions": data_versions,
            "formulation_version": ctx.version,
        }
        store_result(session, job_id, "texture", jsonable(payload))
        emitter.result_ready()
        emitter.completed()
    finally:
        session.close()
