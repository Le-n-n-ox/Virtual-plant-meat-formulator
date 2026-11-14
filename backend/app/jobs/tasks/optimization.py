"""Optimization job: LP for linear problems, multistart SLSQP for texture objectives.

Every candidate is re-evaluated through the same nutrition engine and prediction code as a
normal job, re-validated, and domain-checked before it is stored.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from decimal import Decimal
from typing import Any

from sqlalchemy import select

from app.config import get_settings
from app.core.ids import new_id
from app.db.models import Candidate
from app.db.session import SessionLocal
from app.domain.types import Line
from app.jobs.events import JobCancelledSignal, JobEmitter, JobFailure
from app.jobs.tasks.common import (
    calc_version,
    jsonable,
    load_context,
    parse_process,
    store_result,
    update_job,
)

SCENE_DEFAULT: dict[str, Any] = {"visual_basis": "illustrative", "variables": []}


def _lines_from_percent(x: Mapping[str, float]) -> list[Line]:
    return [Line(ingredient_id=k, percent=Decimal(str(v))) for k, v in x.items() if v > 0]


def run_optimization(job_id: str, emitter: JobEmitter) -> None:
    from app.api.errors import ApiError
    from app.db.repositories.ingredients import dataset_versions, get_pattern
    from app.domain import amino_acids, nutrition
    from app.domain.optimization import constraints as cons
    from app.domain.optimization import objectives as objs
    from app.domain.optimization import solver
    from app.domain.texture.features import composition_from_blend
    from app.domain.validation import validate_formulation
    from app.services.texture import TextureService

    settings = get_settings()
    session = SessionLocal()
    try:
        emitter.stage("validating")
        params = load_context(session, job_id).params
        constraint_params = params.get("constraints") or {}
        bound_ids = [
            b["ingredient_id"] for b in constraint_params.get("ingredient_bounds", []) or []
        ]
        ctx = load_context(session, job_id, extra_ingredient_ids=bound_ids)
        unknown = [i for i in bound_ids if i not in ctx.ingredients]
        if unknown:
            raise JobFailure(
                "validation_failed",
                "Unknown ingredient in bounds.",
                {
                    "issues": [
                        {
                            "code": "unknown_ingredient",
                            "ingredient_id": i,
                            "message": f"Unknown ingredient {i}.",
                        }
                        for i in unknown
                    ]
                },
            )
        try:
            constraint_set = cons.parse_constraints(constraint_params)
            objective_list = objs.parse_objectives(params.get("objectives") or [])
        except cons.ParamsError as exc:
            raise JobFailure("validation_failed", str(exc), {"issues": exc.issues}) from exc

        emitter.stage("preparing_constraints")
        process = parse_process(params.get("process"))
        texture_targets = [o.target for o in objective_list if objs.is_texture_target(o.target)]
        service = TextureService(session, settings)
        try:
            models = service.require_models(texture_targets) if texture_targets else {}
        except ApiError as exc:
            raise JobFailure(exc.code, exc.message, exc.details) from exc

        try:
            pattern = get_pattern(session, params.get("amino_acid_pattern_id"))
        except ApiError:
            pattern = None

        ingredient_ids = list(ctx.ingredients.keys())
        ingredients = ctx.ingredients

        def composition_of(x: Mapping[str, float]) -> dict[str, float | None]:
            blend = nutrition.blend_composition(_lines_from_percent(x), ingredients)
            return composition_from_blend(blend)

        predictors: dict[str, Callable[[Mapping[str, float]], float | None]] = {}
        for target in texture_targets:
            fn = service.predictor_fn(target, process)

            def predictor(
                x: Mapping[str, float],
                _fn: Callable[[Mapping[str, Any]], float] = fn,
            ) -> float | None:
                return _fn(composition_of(x))

            predictors[target] = predictor

        seed = int(ctx.seed if ctx.seed is not None else params.get("seed", 0))
        data_versions = dataset_versions(session, ingredient_ids)
        update_job(
            session,
            job_id,
            model_ids=[m.id for m in models.values()],
            data_versions=data_versions,
            calc_version=calc_version(
                "optimization-1.0.0", nutrition.CALC_VERSION, amino_acids.CALC_VERSION
            ),
            seed=seed,
        )
        out_of_domain_policy = str(params.get("out_of_domain", "warn"))
        stored: list[str] = []

        def evaluate_and_store(candidate: Any, rank: int, pareto: bool) -> str | None:
            lines = list(candidate.lines)
            check = validate_formulation(lines, ingredients, None, new_version=False)
            if not check.valid:
                return None
            nut = nutrition.calculate_nutrition(lines, ingredients, {"protein": "g"}).get("protein")
            metrics: dict[str, Any] = {
                "protein_g_per_100g": float(nut.value) if nut and nut.value is not None else None
            }
            if pattern is not None:
                aa = amino_acids.score_amino_acids(lines, ingredients, pattern).to_payload()
                metrics["limiting_amino_acid"] = aa.get("limiting_amino_acid")
                metrics["amino_acid_score"] = aa.get("score")
                metrics["amino_acid_method"] = "AAS"
            prices = [ingredients[ln.ingredient_id].price_per_kg for ln in lines]
            if all(p is not None for p in prices):
                currency = next(
                    (ingredients[ln.ingredient_id].price_currency for ln in lines), None
                )
                total = sum(
                    (ln.percent / 100 * p for ln, p in zip(lines, prices, strict=True)),
                    Decimal(0),
                )
                metrics["cost_per_kg"] = {"value": float(round(total, 2)), "currency": currency}
            else:
                metrics["cost_per_kg"] = None
            for key, value in (candidate.objective_values or {}).items():
                metrics.setdefault(key, value)

            predictions: list[dict[str, Any]] = []
            warnings: list[dict[str, Any]] = []
            if texture_targets:
                comp = composition_from_blend(nutrition.blend_composition(lines, ingredients))
                outcome = service.predict(comp, process, texture_targets)
                predictions = outcome.get("predictions", [])
                warnings = outcome.get("warnings", [])
                if out_of_domain_policy == "drop" and any(
                    p.get("in_domain") is False for p in predictions
                ):
                    return None
            row = Candidate(
                id=new_id("cand"),
                job_id=job_id,
                formulation_id=ctx.formulation_id,
                rank=rank,
                lines=[
                    {"ingredient_id": ln.ingredient_id, "percent": str(ln.percent)} for ln in lines
                ],
                metrics=jsonable(metrics),
                predictions=jsonable(predictions),
                model_ids=[m.id for m in models.values()],
                warnings=jsonable(warnings),
                scene=SCENE_DEFAULT,
                cost=Decimal(str(metrics["cost_per_kg"]["value"]))
                if metrics.get("cost_per_kg")
                else None,
                pareto=pareto,
            )
            session.add(row)
            session.commit()
            stored.append(row.id)
            emitter.candidate_ready(row.id, f"Candidate {len(stored)} stored")
            for warning in warnings:
                emitter.warning(
                    warning.get("message", "Candidate warning"),
                    warning.get("code", "warning"),
                    {**(warning.get("details") or {}), "candidate_id": row.id},
                )
            return row.id

        emitter.stage("searching")

        def progress(done: int, total: int) -> None:
            emitter.progress(done, total, f"Start {done} of {total}")

        def cancelled() -> bool:
            return emitter.cancel_requested()

        candidate_ids_by_start: dict[int, str] = {}

        def on_candidate(candidate: Any) -> None:
            cid = evaluate_and_store(candidate, rank=0, pareto=False)
            if cid:
                candidate_ids_by_start[id(candidate)] = cid

        try:
            outcome = solver.solve(
                ingredients,
                ingredient_ids,
                constraint_set,
                objective_list,
                n_candidates=int(params.get("n_candidates", 5)),
                seed=seed,
                texture_predictors=predictors or None,
                composition_fn=composition_of,
                amino_pattern=pattern,
                n_starts=int(params.get("n_starts", 10)),
                progress_cb=progress,
                cancel_cb=cancelled,
                candidate_cb=on_candidate if predictors else None,
            )
        except solver.InfeasibleError as exc:
            raise JobFailure(
                "infeasible", exc.explanation, {"violated_constraints": exc.violated}
            ) from exc
        except solver.MissingDataError as exc:
            raise JobFailure(
                "missing_ingredient_data",
                f"Missing {exc.key} for ingredients needed by the constraints or objectives.",
                {"key": exc.key, "ingredient_ids": list(exc.ingredient_ids)},
            ) from exc
        except solver.OptimizationCancelled as exc:
            _mark_cancelled(session, stored)
            raise JobCancelledSignal() from exc

        emitter.stage("ranking")
        if emitter.cancel_requested():
            _mark_cancelled(session, stored)
            raise JobCancelledSignal()
        final_ids: list[str] = []
        for cand in outcome.candidates:
            existing = candidate_ids_by_start.get(id(cand))
            if existing:
                row = session.get(Candidate, existing)
                if row is not None:
                    row.rank = cand.rank
                    row.pareto = cand.pareto
                    session.commit()
                    final_ids.append(existing)
                continue
            cid = evaluate_and_store(cand, rank=cand.rank, pareto=cand.pareto)
            if cid:
                final_ids.append(cid)
        # Candidates streamed during search but not kept after ranking stay readable,
        # ranked after the final set.
        extra = [c for c in stored if c not in final_ids]
        for offset, cid in enumerate(extra, start=len(final_ids) + 1):
            row = session.get(Candidate, cid)
            if row is not None and row.rank == 0:
                row.rank = offset
        session.commit()
        if not final_ids:
            raise JobFailure(
                "infeasible",
                "No candidate satisfied every constraint after rounding and re-validation.",
                {"summary": jsonable(outcome.summary)},
            )

        emitter.stage("storing")
        payload = {
            "candidate_ids": final_ids,
            "summary": jsonable(outcome.summary),
            "objectives": params.get("objectives") or [],
            "constraints": constraint_params,
            "seed": seed,
            "model_ids": [m.id for m in models.values()],
            "data_versions": data_versions,
            "formulation_version": ctx.version,
        }
        store_result(session, job_id, "optimization", payload)
        emitter.result_ready()
        emitter.completed(f"{len(final_ids)} candidates")
    finally:
        session.close()


def _mark_cancelled(session, candidate_ids: list[str]) -> None:  # type: ignore[no-untyped-def]
    if not candidate_ids:
        return
    for row in session.execute(select(Candidate).where(Candidate.id.in_(candidate_ids))).scalars():
        row.from_cancelled_job = True
    session.commit()
