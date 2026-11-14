"""Optimization engine (guide 8.4): exact HiGHS LPs for linear problems, SLSQP multistart
for black-box (texture) and amino-acid-score objectives, Pareto filtering and ranking.

Pure domain code: no FastAPI, SQLAlchemy or Celery imports.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, cast

import numpy as np
from scipy.optimize import linprog, minimize

from app.domain.optimization.constraints import (
    ConstraintSet,
    ParamsError,
    normalize_unit,
    nutrient_coefficient,
)
from app.domain.optimization.objectives import (
    Objective,
    nutrient_target_spec,
)
from app.domain.types import AminoAcidPattern, IngredientData, Line

TexturePredictor = Callable[[Mapping[str, float]], float | None]
_REL_TOL = 1e-6
_FAIL_PENALTY = 1e6


class InfeasibleError(Exception):
    def __init__(self, violated: list[dict[str, Any]], explanation: str):
        self.violated = violated
        self.explanation = explanation
        super().__init__(explanation)


class OptimizationCancelled(Exception):
    pass


class MissingDataError(Exception):
    def __init__(self, key: str, ingredient_ids: Sequence[str]):
        self.key = key
        self.ingredient_ids = list(ingredient_ids)
        super().__init__(f"Missing {key!r} for ingredients: {', '.join(self.ingredient_ids)}")


@dataclass
class CandidateSolution:
    lines: list[Line]
    objective_values: dict[str, float | None]
    pareto: bool = False
    rank: int = 0
    constraint_report: list[dict[str, Any]] = field(default_factory=list)
    start_index: int = 0


@dataclass
class OptimizationOutcome:
    candidates: list[CandidateSolution]
    summary: dict[str, Any]


# ---------------------------------------------------------------------------
# problem construction
# ---------------------------------------------------------------------------


@dataclass
class _Row:
    """Linear inequality ``g . x >= lin`` (min) or ``g . x <= lin`` (max), x in percent."""

    name: str
    description: str
    kind: str  # min | max
    g: np.ndarray  # may contain NaN (missing data)
    lin: float
    limit: float  # limit as shown to the user
    unit: str
    scale: float = 1.0
    aa: np.ndarray | None = None  # amino rows: mg per 100 g of each ingredient
    prot: np.ndarray | None = None


@dataclass
class _Obj:
    spec: Objective
    kind: str  # linear | aas | texture
    c: np.ndarray | None = None  # linear: natural value = c . x
    sign: float = 1.0
    aa: np.ndarray | None = None  # aas: (k, n) mg per 100 g
    prot: np.ndarray | None = None
    ref: np.ndarray | None = None  # aas: required mg per g protein
    predictor: TexturePredictor | None = None


def _dot(g: np.ndarray, x: np.ndarray) -> float:
    mask = x != 0
    return float(np.dot(g[mask], x[mask]))


def _fnum(v: float | None) -> float | None:
    return None if v is None or not math.isfinite(v) else float(v)


def _lp(
    c: np.ndarray,
    A_ub: np.ndarray,
    b_ub: np.ndarray,
    A_eq: np.ndarray,
    b_eq: np.ndarray,
    bounds: Sequence[tuple[float, float | None]],
) -> Any:
    res = linprog(
        c,
        A_ub=A_ub if len(b_ub) else None,
        b_ub=b_ub if len(b_ub) else None,
        A_eq=A_eq,
        b_eq=b_eq,
        bounds=bounds,
        method="highs",
    )
    return res


class _Problem:
    def __init__(
        self,
        ingredients: Mapping[str, IngredientData],
        ids: Sequence[str],
        cons: ConstraintSet,
        objectives: Sequence[Objective],
        pattern: AminoAcidPattern | None,
        predictors: Mapping[str, TexturePredictor] | None,
        strict: bool,
    ):
        self.ids = list(dict.fromkeys(ids))
        self.n = len(self.ids)
        self.cons = cons
        self.pattern = pattern
        self.strict = strict
        ings = [ingredients[i] for i in self.ids]
        self.lb = np.zeros(self.n)
        self.ub = np.full(self.n, 100.0)
        pos = {i: k for k, i in enumerate(self.ids)}
        for b in cons.ingredient_bounds:
            if b.ingredient_id in pos:
                k = pos[b.ingredient_id]
                self.lb[k] = max(self.lb[k], b.min_percent)
                self.ub[k] = min(self.ub[k], b.max_percent)
        for e in cons.excluded_ingredient_ids:
            if e in pos:
                self.lb[pos[e]] = 0.0
                self.ub[pos[e]] = 0.0
        self.free = self.ub > 0
        self._ings = ings
        self.rows: list[_Row] = []
        self.objs: list[_Obj] = []
        self._build_rows()
        self._build_objectives(objectives, predictors)
        if strict:
            self._check_missing()
        self._finish()

    # -- coefficient helpers ------------------------------------------------
    def _coef(self, key: str, unit: str) -> np.ndarray:
        return np.array(
            [
                v if (v := nutrient_coefficient(ing, key, unit)) is not None else np.nan
                for ing in self._ings
            ]
        )

    def _price(self) -> np.ndarray:
        return np.array(
            [float(i.price_per_kg) if i.price_per_kg is not None else np.nan for i in self._ings]
        )

    def _members(self, key: str) -> tuple[list[str], float]:
        if self.pattern is None:
            raise ParamsError(
                [
                    {
                        "code": "missing_amino_acid_pattern",
                        "message": f"An amino-acid pattern is required for {key!r}",
                        "field": "amino_acid_pattern_id",
                    }
                ]
            )
        if key not in self.pattern.values:
            raise ParamsError(
                [
                    {
                        "code": "unknown_amino_acid",
                        "message": f"{key!r} is not in reference pattern {self.pattern.name}",
                        "field": key,
                    }
                ]
            )
        return list(self.pattern.groupings.get(key, [key])), float(self.pattern.values[key])

    def _aa_vector(self, members: list[str]) -> np.ndarray:
        total = np.zeros(self.n)
        for m in members:
            total = total + self._coef(m, "mg")
        return total

    # -- rows -----------------------------------------------------------
    def _build_rows(self) -> None:
        names: dict[str, int] = {}

        def uniq(name: str) -> str:
            names[name] = names.get(name, 0) + 1
            return name if names[name] == 1 else f"{name}#{names[name]}"

        for lim in self.cons.nutrient_limits:
            unit = normalize_unit(lim.unit)
            word = "at least" if lim.kind == "min" else "at most"
            if unit == "mg_per_g_protein":
                members, r = self._members(lim.key)
                aa = self._aa_vector(members)
                prot = self._coef("protein", "g")
                g = (aa - r * prot) / 100.0
                row = _Row(
                    uniq(f"{lim.key}_{lim.kind}"),
                    f"{lim.key} {word} {lim.value:g} mg per g protein",
                    lim.kind,
                    g,
                    0.0,
                    lim.value,
                    unit,
                    aa=aa,
                    prot=prot,
                )
                # the linearisation uses the limit value itself as r
                row.g = (aa - lim.value * prot) / 100.0
            else:
                g = self._coef(lim.key, unit) / 100.0
                row = _Row(
                    uniq(f"{lim.key}_{lim.kind}"),
                    f"{lim.key} {word} {lim.value:g} {unit} per 100 g",
                    lim.kind,
                    g,
                    lim.value,
                    lim.value,
                    unit,
                )
            self.rows.append(row)
        cc = self.cons.cost_ceiling
        if cc is not None:
            self._check_currency(cc.currency)
            self.rows.append(
                _Row(
                    "cost_ceiling",
                    f"Cost at most {cc.value:g} {cc.currency} per kg",
                    "max",
                    self._price() / 100.0,
                    cc.value,
                    cc.value,
                    cc.currency,
                )
            )

    def _check_currency(self, currency: str) -> None:
        if not currency:
            return
        for i, ing in enumerate(self._ings):
            if self.free[i] and ing.price_currency not in (None, currency):
                raise ParamsError(
                    [
                        {
                            "code": "currency_mismatch",
                            "message": f"Ingredient {ing.id} is priced in {ing.price_currency}, "
                            f"not {currency}",
                            "field": "constraints.cost_ceiling.currency",
                        }
                    ]
                )

    # -- objectives -----------------------------------------------------
    def _build_objectives(
        self, objectives: Sequence[Objective], predictors: Mapping[str, TexturePredictor] | None
    ) -> None:
        for o in objectives:
            sign = -1.0 if o.direction == "maximize" else 1.0
            if o.target == "cost_per_kg":
                self.objs.append(_Obj(o, "linear", self._price() / 100.0, sign))
            elif o.target == "amino_acid_score":
                if self.pattern is None:
                    raise ParamsError(
                        [
                            {
                                "code": "missing_amino_acid_pattern",
                                "message": "amino_acid_score needs an amino-acid pattern",
                                "field": "amino_acid_pattern_id",
                            }
                        ]
                    )
                keys = list(self.pattern.values)
                aa = np.vstack([self._aa_vector(self._members(k)[0]) for k in keys])
                ref = np.array([float(self.pattern.values[k]) for k in keys])
                self.objs.append(
                    _Obj(o, "aas", aa=aa, prot=self._coef("protein", "g"), ref=ref, sign=sign)
                )
            elif (spec := nutrient_target_spec(o.target)) is not None:
                self.objs.append(_Obj(o, "linear", self._coef(*spec) / 100.0, sign))
            else:
                pred = (predictors or {}).get(o.target)
                if pred is None and self.strict:
                    raise ParamsError(
                        [
                            {
                                "code": "model_unavailable",
                                "message": f"No predictor for texture target {o.target!r}",
                                "field": "objectives",
                            }
                        ]
                    )
                self.objs.append(_Obj(o, "texture", predictor=pred, sign=sign))

    def _check_missing(self) -> None:
        free = self.free

        def check(key: str, arr: np.ndarray) -> None:
            bad = [self.ids[i] for i in range(self.n) if free[i] and np.isnan(arr[i])]
            if bad:
                raise MissingDataError(key, bad)

        for row, lim in zip(self.rows, [*self.cons.nutrient_limits, None], strict=False):
            if row.name == "cost_ceiling":
                check("price", row.g)
            elif row.aa is not None:
                assert lim is not None and row.prot is not None
                check("protein", row.prot)
                members, _ = self._members(lim.key)
                for m in members:
                    check(m, self._coef(m, "mg"))
            elif lim is not None:
                check(lim.key, row.g)
        for o in self.objs:
            t = o.spec.target
            if o.kind == "linear":
                spec = nutrient_target_spec(t)
                assert o.c is not None
                check("price" if spec is None else spec[0], o.c)
            elif o.kind == "aas":
                assert o.aa is not None and o.prot is not None and self.pattern is not None
                check("protein", o.prot)
                for k, key in enumerate(self.pattern.values):
                    for m in self._members(key)[0]:
                        check(m, self._coef(m, "mg"))
                    check(key, o.aa[k])

    def _finish(self) -> None:
        m = len(self.rows)
        A = np.zeros((m, self.n))
        b = np.zeros(m)
        for j, r in enumerate(self.rows):
            g = np.nan_to_num(r.g)
            A[j] = -g if r.kind == "min" else g
            b[j] = -r.lin if r.kind == "min" else r.lin
            r.scale = max(1.0, abs(r.lin), float(np.max(np.abs(g), initial=0.0)) * 100.0)
        self.A, self.b = A, b
        self.scale = np.array([r.scale for r in self.rows])
        self.tol = _REL_TOL * self.scale

    # -- evaluation -----------------------------------------------------
    def nat(self, o: _Obj, x: np.ndarray) -> float | None:
        if o.kind == "linear":
            assert o.c is not None
            return _fnum(_dot(o.c, x))
        if o.kind == "aas":
            assert o.aa is not None and o.prot is not None and o.ref is not None
            p = _dot(o.prot, x)
            if not math.isfinite(p):
                return None
            if p <= 0:
                return 0.0
            dens = np.array([_dot(o.aa[k], x) for k in range(len(o.ref))]) / p
            return _fnum(float(np.min(dens / o.ref)))
        if o.predictor is None:
            return None
        v = o.predictor({i: float(p) for i, p in zip(self.ids, x, strict=True)})
        return _fnum(v)

    def objective_values(self, x: np.ndarray) -> dict[str, float | None]:
        return {o.spec.target: self.nat(o, x) for o in self.objs}

    def minform(self, o: _Obj, nat: float | None) -> float:
        if nat is None:
            return math.inf
        if o.spec.direction == "target":
            return abs(nat - float(o.spec.value or 0.0))
        return o.sign * nat

    def report(self, x: np.ndarray) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for j, r in enumerate(self.rows):
            val = _dot(r.g, x)
            if r.kind == "min":
                ok = bool(val >= r.lin - self.tol[j])
            else:
                ok = bool(val <= r.lin + self.tol[j])
            shown = val
            if r.aa is not None:
                assert r.prot is not None
                p = _dot(r.prot, x)
                shown = _dot(r.aa, x) / p if p > 0 else float("nan")
            out.append(
                {
                    "constraint": r.name,
                    "value": _fnum(shown),
                    "limit": r.limit,
                    "satisfied": ok and math.isfinite(val),
                }
            )
        for i, ing in enumerate(self.ids):
            v = float(x[i])
            if i < self.n and self.ub[i] == 0 and ing in self.cons.excluded_ingredient_ids:
                out.append(
                    {
                        "constraint": f"excluded:{ing}",
                        "value": v,
                        "limit": 0.0,
                        "satisfied": v <= 1e-6,
                    }
                )
                continue
            if self.lb[i] > 0:
                out.append(
                    {
                        "constraint": f"ingredient_min:{ing}",
                        "value": v,
                        "limit": float(self.lb[i]),
                        "satisfied": bool(v >= self.lb[i] - 1e-6),
                    }
                )
            if self.ub[i] < 100:
                out.append(
                    {
                        "constraint": f"ingredient_max:{ing}",
                        "value": v,
                        "limit": float(self.ub[i]),
                        "satisfied": bool(v <= self.ub[i] + 1e-6),
                    }
                )
        return out

    # -- LP building blocks ----------------------------------------------
    def _bounds(self, extra: int = 0) -> list[tuple[float, float | None]]:
        return [(float(lo), float(hi)) for lo, hi in zip(self.lb, self.ub, strict=True)] + [
            (0.0, None)
        ] * extra

    def lp_direction(self, r: np.ndarray | None = None) -> tuple[np.ndarray | None, str]:
        cvec = np.zeros(self.n) if r is None else r
        res = _lp(cvec, self.A, self.b, np.ones((1, self.n)), np.array([100.0]), self._bounds())
        return (res.x if res.status == 0 else None), str(res.message)

    def lin_terms(self) -> list[_Obj]:
        return [o for o in self.objs if o.kind == "linear"]

    def scalar_lp(
        self,
        terms: Sequence[_Obj],
        weights: Sequence[float],
        ref: np.ndarray | None = None,
        rng_: np.ndarray | None = None,
        direction: np.ndarray | None = None,
        caps: Sequence[tuple[int, float]] = (),
    ) -> np.ndarray | None:
        """Minimise sum_k w_k * f_k / range_k (+ optional extra x direction) subject to caps."""
        tgt = [k for k, o in enumerate(terms) if o.spec.direction == "target"]
        nd = len(tgt)
        dpos = {k: self.n + q for q, k in enumerate(tgt)}
        nv = self.n + nd
        cost = np.zeros(nv)
        rows_ub = [np.hstack([self.A, np.zeros((len(self.b), nd))])] if len(self.b) else []
        rhs_ub = [self.b] if len(self.b) else []
        extra_rows: list[np.ndarray] = []
        extra_rhs: list[float] = []
        for k, o in enumerate(terms):
            assert o.c is not None
            c = np.nan_to_num(o.c)
            s = 1.0 if rng_ is None else float(rng_[k])
            w = weights[k] / s
            if k in dpos:
                t = float(o.spec.value or 0.0)
                cost[dpos[k]] += w
                for sg in (1.0, -1.0):
                    row = np.zeros(nv)
                    row[: self.n] = sg * c
                    row[dpos[k]] = -1.0
                    extra_rows.append(row)
                    extra_rhs.append(sg * t)
            else:
                cost[: self.n] += w * o.sign * c
        if direction is not None:
            cost[: self.n] += direction
        for k, cap in caps:
            row = np.zeros(nv)
            if k in dpos:
                row[dpos[k]] = 1.0
            else:
                ck = terms[k].c
                assert ck is not None
                row[: self.n] = terms[k].sign * np.nan_to_num(ck)
            extra_rows.append(row)
            extra_rhs.append(cap)
        if extra_rows:
            rows_ub.append(np.vstack(extra_rows))
            rhs_ub.append(np.array(extra_rhs))
        A_ub = np.vstack(rows_ub) if rows_ub else np.zeros((0, nv))
        b_ub = np.concatenate(rhs_ub) if rhs_ub else np.zeros(0)
        A_eq = np.zeros((1, nv))
        A_eq[0, : self.n] = 1.0
        res = _lp(cost, A_ub, b_ub, A_eq, np.array([100.0]), self._bounds(nd))
        return res.x[: self.n] if res.status == 0 else None

    def term_value(self, o: _Obj, x: np.ndarray) -> float:
        assert o.c is not None
        nat = _dot(np.nan_to_num(o.c), x)
        return self.minform(o, nat)

    # -- rounding ---------------------------------------------------------
    def _penalty(self, v: np.ndarray) -> tuple[float, bool]:
        r = self.A @ v - self.b
        pen = float((np.maximum(r, 0) / self.scale).sum()) if len(r) else 0.0
        bp = np.maximum(self.lb - v, 0) + np.maximum(v - self.ub, 0)
        ok = bool((r <= self.tol).all() and (bp <= 1e-6).all())
        return pen + float(bp.sum()) / 100.0, ok

    def _nudge(self, t: np.ndarray) -> np.ndarray | None:
        t = t.copy()
        n = self.n
        lb, ub = self.lb, self.ub
        eye = np.eye(n, dtype=bool)

        def bp(vv: np.ndarray) -> np.ndarray:
            return cast(np.ndarray, np.maximum(lb - vv, 0) + np.maximum(vv - ub, 0))

        for _ in range(300):
            v = t / 10.0
            pen, ok = self._penalty(v)
            if ok:
                return t
            Av = self.A @ v - self.b
            D = 0.1 * (self.A[:, None, :] - self.A[:, :, None])  # [j, a, b]
            rowpen = (np.maximum(Av[:, None, None] + D, 0) / self.scale[:, None, None]).sum(0)
            cur = bp(v)
            total = (
                rowpen
                + (
                    cur.sum()
                    - cur[:, None]
                    - cur[None, :]
                    + bp(v - 0.1)[:, None]
                    + bp(v + 0.1)[None, :]
                )
                / 100.0
            )
            invalid = eye | (t[:, None] <= 0) | (~self.free)[None, :]
            total = np.where(invalid, np.inf, total)
            a, b_ = np.unravel_index(int(np.argmin(total)), total.shape)
            if not total[a, b_] < pen - 1e-12:
                return None
            t[a] -= 1
            t[b_] += 1
        return None

    def round_candidate(self, x: np.ndarray) -> np.ndarray | None:
        """Round to 0.1 pp (as integer tenths), renormalise to 100.0, re-validate."""
        x = np.clip(x, self.lb, self.ub)
        tries = []
        t = np.round(x * 10).astype(int)
        tries.append(t)
        f = np.floor(x * 10 + 1e-9).astype(int)
        short = 1000 - int(f.sum())
        order = np.argsort(-(x * 10 - f), kind="stable")
        for k in order[: max(short, 0)]:
            f[k] += 1
        tries.append(f)
        for t in tries:
            t = t.copy()
            t[~self.free] = 0
            diff = 1000 - int(t.sum())
            if diff:
                t[int(np.argmax(t))] += diff
            if (t < 0).any():
                continue
            out = self._nudge(t)
            if out is not None:
                return out
        return None


# ---------------------------------------------------------------------------
# infeasibility
# ---------------------------------------------------------------------------


def _elastic(prob: _Problem) -> InfeasibleError:
    n, m = prob.n, len(prob.rows)
    lo_idx = [i for i in range(n) if prob.free[i] and prob.lb[i] > 0]
    hi_idx = [i for i in range(n) if prob.free[i] and prob.ub[i] < 100]
    nv = n + m + len(lo_idx) + len(hi_idx)
    cost = np.zeros(nv)
    A = []
    b = []
    for j in range(m):
        row = np.zeros(nv)
        row[:n] = prob.A[j]
        row[n + j] = -1.0
        A.append(row)
        b.append(prob.b[j])
        cost[n + j] = 1.0 / prob.rows[j].scale
    for q, i in enumerate(lo_idx):
        row = np.zeros(nv)
        row[i] = -1.0
        row[n + m + q] = -1.0
        A.append(row)
        b.append(-prob.lb[i])
        cost[n + m + q] = 1.0 / 100.0
    for q, i in enumerate(hi_idx):
        row = np.zeros(nv)
        row[i] = 1.0
        row[n + m + len(lo_idx) + q] = -1.0
        A.append(row)
        b.append(prob.ub[i])
        cost[n + m + len(lo_idx) + q] = 1.0 / 100.0
    Aeq = np.zeros((1, nv))
    Aeq[0, :n] = 1.0
    bounds = [(0.0, float(prob.ub[i]) if not prob.free[i] else 100.0) for i in range(n)] + [
        (0.0, None)
    ] * (nv - n)
    res = _lp(
        cost, np.array(A) if A else np.zeros((0, nv)), np.array(b), Aeq, np.array([100.0]), bounds
    )
    if res.status != 0:
        return InfeasibleError(
            [],
            "No formulation exists: no ingredient is left to make up 100 %.",
        )
    s = res.x
    violated: list[dict[str, Any]] = []
    for j, r in enumerate(prob.rows):
        slack = float(s[n + j])
        if slack > _REL_TOL * r.scale:
            if r.aa is not None:
                desc = f"{r.description}; not reachable together with the other limits"
            else:
                reach = r.lin - slack if r.kind == "min" else r.lin + slack
                desc = f"{r.description}; closest achievable is about {reach:.4g}"
            violated.append(
                {
                    "constraint": r.name,
                    "description": desc,
                    "required": r.limit,
                    "achievable_slack": slack,
                }
            )
    for q, i in enumerate(lo_idx):
        slack = float(s[n + m + q])
        if slack > 1e-6:
            violated.append(
                {
                    "constraint": f"ingredient_min:{prob.ids[i]}",
                    "description": f"Ingredient {prob.ids[i]} needs at least {prob.lb[i]:g} %; "
                    f"only {prob.lb[i] - slack:.4g} % fits with the other limits",
                    "required": float(prob.lb[i]),
                    "achievable_slack": slack,
                }
            )
    for q, i in enumerate(hi_idx):
        slack = float(s[n + m + len(lo_idx) + q])
        if slack > 1e-6:
            violated.append(
                {
                    "constraint": f"ingredient_max:{prob.ids[i]}",
                    "description": f"Ingredient {prob.ids[i]} is limited to {prob.ub[i]:g} %; "
                    f"{prob.ub[i] + slack:.4g} % would be needed with the other limits",
                    "required": float(prob.ub[i]),
                    "achievable_slack": slack,
                }
            )
    if violated:
        explanation = (
            "The constraints cannot all be met. The smallest set of conflicting limits found: "
            + "; ".join(v["description"] for v in violated)
            + "."
        )
    else:
        explanation = "The constraints cannot all be met together."
    return InfeasibleError(violated, explanation)


# ---------------------------------------------------------------------------
# public API
# ---------------------------------------------------------------------------


def evaluate_lines(
    lines: Sequence[Line],
    ingredients: Mapping[str, IngredientData],
    constraints: ConstraintSet,
    objectives: Sequence[Objective],
    amino_pattern: AminoAcidPattern | None = None,
    texture_predictors: Mapping[str, TexturePredictor] | None = None,
) -> dict[str, Any]:
    """Objective values and constraint report for a finished formulation (re-validation)."""
    ids = [ln.ingredient_id for ln in lines]
    for b in constraints.ingredient_bounds:
        if b.ingredient_id in ingredients and b.ingredient_id not in ids:
            ids.append(b.ingredient_id)
    for e in constraints.excluded_ingredient_ids:
        if e in ingredients and e not in ids:
            ids.append(e)
    prob = _Problem(
        ingredients, ids, constraints, objectives, amino_pattern, texture_predictors, False
    )
    x = np.zeros(prob.n)
    pos = {i: k for k, i in enumerate(prob.ids)}
    for ln in lines:
        x[pos[ln.ingredient_id]] += float(ln.percent)
    report = prob.report(x)
    return {
        "objective_values": prob.objective_values(x),
        "constraint_report": report,
        "feasible": all(r["satisfied"] for r in report),
    }


def _to_lines(prob: _Problem, t: np.ndarray) -> list[Line]:
    return [Line(prob.ids[i], Decimal(int(t[i])) / Decimal(10)) for i in range(prob.n) if t[i] > 0]


class _Collector:
    def __init__(self, prob: _Problem, candidate_cb: Callable[[CandidateSolution], None] | None):
        self.prob = prob
        self.cb = candidate_cb
        self.items: list[tuple[CandidateSolution, np.ndarray]] = []
        self.seen: set[tuple[tuple[str, Decimal], ...]] = set()
        self.n_feasible = 0

    def add(self, x: np.ndarray | None, start_index: int) -> bool:
        if x is None:
            return False
        t = self.prob.round_candidate(x)
        if t is None:
            return False
        v = t / 10.0
        vals = self.prob.objective_values(v)
        if any(val is None for val in vals.values()):
            return False
        self.n_feasible += 1
        lines = _to_lines(self.prob, t)
        key = tuple((ln.ingredient_id, ln.percent) for ln in lines)
        if key in self.seen:
            return False
        self.seen.add(key)
        cand = CandidateSolution(
            lines=lines,
            objective_values=vals,
            constraint_report=self.prob.report(v),
            start_index=start_index,
        )
        self.items.append((cand, v))
        if self.cb:
            self.cb(cand)
        return True


def _rank(
    prob: _Problem, items: list[tuple[CandidateSolution, np.ndarray]], n_keep: int
) -> list[CandidateSolution]:
    if not items:
        return []
    objs = prob.objs
    if not objs:
        for r, (c, _) in enumerate(items):
            c.rank, c.pareto = r + 1, True
        return [c for c, _ in items][:n_keep]
    M = np.array(
        [[prob.minform(o, c.objective_values[o.spec.target]) for o in objs] for c, _ in items]
    )
    N = len(items)
    tol = 1e-9 * (1 + np.abs(M).max())
    for a in range(N):
        dominated = False
        for b in range(N):
            if a != b and (M[b] <= M[a] + tol).all() and (M[b] < M[a] - tol).any():
                dominated = True
                break
        items[a][0].pareto = not dominated
    lo, hi = M.min(0), M.max(0)
    rng_ = np.where(hi - lo > 1e-12, hi - lo, 1.0)
    w = np.array([o.spec.weight for o in objs])
    score = (((M - lo) / rng_) * w).sum(1) / w.sum()
    order = sorted(
        range(N),
        key=lambda i: (
            not items[i][0].pareto,
            round(float(score[i]), 12),
            tuple((ln.ingredient_id, ln.percent) for ln in items[i][0].lines),
        ),
    )
    out = []
    for r, i in enumerate(order[:n_keep]):
        items[i][0].rank = r + 1
        out.append(items[i][0])
    return out


def _linear_ranges(
    prob: _Problem, terms: list[_Obj]
) -> tuple[np.ndarray, np.ndarray, list[np.ndarray | None]]:
    anchors: list[np.ndarray | None] = []
    for k in range(len(terms)):
        w = [1.0 if j == k else 0.0 for j in range(len(terms))]
        anchors.append(prob.scalar_lp(terms, w))
    ref = np.zeros(len(terms))
    rng_ = np.ones(len(terms))
    for k, o in enumerate(terms):
        vals = [prob.term_value(o, a) for a in anchors if a is not None]
        if anchors[k] is not None and vals:
            ref[k] = prob.term_value(o, cast(np.ndarray, anchors[k]))
            span = max(vals) - ref[k]
            rng_[k] = span if span > 1e-9 else 1.0
    return ref, rng_, anchors


def solve(
    ingredients: Mapping[str, IngredientData],
    ingredient_ids: Sequence[str],
    constraints: ConstraintSet,
    objectives: Sequence[Objective],
    *,
    n_candidates: int = 5,
    seed: int = 0,
    texture_predictors: Mapping[str, TexturePredictor] | None = None,
    composition_fn: Callable[[Mapping[str, float]], Mapping[str, float | None]] | None = None,
    amino_pattern: AminoAcidPattern | None = None,
    n_starts: int = 10,
    progress_cb: Callable[[int, int], None] | None = None,
    cancel_cb: Callable[[], bool] | None = None,
    candidate_cb: Callable[[CandidateSolution], None] | None = None,
) -> OptimizationOutcome:
    """Search for formulations (guide 8.4). ``composition_fn`` is accepted for API symmetry; the
    solver computes linear nutrient values itself from the ingredient rows."""
    del composition_fn
    prob = _Problem(
        ingredients,
        ingredient_ids,
        constraints,
        objectives,
        amino_pattern,
        texture_predictors,
        True,
    )
    rng = np.random.default_rng(seed)
    if prob.n == 0 or not prob.free.any():
        raise InfeasibleError([], "No ingredient is available to formulate with.")
    x_feas, msg = prob.lp_direction(None)
    if x_feas is None:
        raise _elastic(prob)

    col = _Collector(prob, candidate_cb)
    messages: list[str] = []
    weights_tried: list[list[float]] = []
    lin = prob.lin_terms()
    nonlinear = any(o.kind != "linear" for o in prob.objs)
    n_cand = max(1, n_candidates)

    if nonlinear:
        method = "slsqp_multistart"
        _search_nonlinear(
            prob, col, rng, n_starts, n_cand, progress_cb, cancel_cb, weights_tried, messages
        )
        used_starts = n_starts
    elif len(prob.objs) <= 1:
        method = "linprog_highs"
        used_starts = 0
        if prob.objs:
            o = prob.objs[0]
            xs = prob.scalar_lp([o], [1.0])
            if xs is not None:
                col.add(xs, 0)
                fstar = prob.term_value(o, xs)
                spread = float(np.nanmax(o.c) - np.nanmin(o.c)) if o.c is not None else 1.0
                scale = max(abs(fstar), 0.5 * spread, 1e-9)
                weights_tried.append([1.0])
                for j in range(1, 6 * n_cand):
                    if len(col.items) >= n_cand:
                        break
                    cap = fstar + 0.02 * j * scale
                    xj = prob.scalar_lp([o], [0.0], direction=rng.random(prob.n), caps=[(0, cap)])
                    col.add(xj, j)
        else:
            for j in range(6 * n_cand):
                if len(col.items) >= n_cand:
                    break
                xj, _ = prob.lp_direction(rng.random(prob.n) if j else None)
                col.add(xj, j)
    else:
        method = "weighted_sum_lp"
        used_starts = 0
        ref, rng_, anchors = _linear_ranges(prob, lin)
        k = len(lin)
        user_w = np.array([o.spec.weight for o in lin])
        grid: list[np.ndarray] = [user_w / user_w.sum()]
        for q in range(k):
            e = np.zeros(k)
            e[q] = 1.0
            grid.append(e)
        for _ in range(6 * n_cand):
            grid.append(rng.dirichlet(np.ones(k)) * user_w / user_w.sum() * k)
        for idx, w in enumerate(grid):
            if len(col.items) >= 4 * n_cand and idx > k + 1:
                break
            xw = prob.scalar_lp(lin, list(w), ref, rng_)
            weights_tried.append([float(v) for v in w])
            col.add(xw, idx)

    if not col.items:
        raise InfeasibleError(
            [],
            "A continuous solution exists but no candidate survives rounding to 0.1 percentage "
            "points; relax the tightest limit slightly.",
        )
    ranked = _rank(prob, col.items, n_cand)
    summary = {
        "method": method,
        "n_starts": used_starts,
        "n_feasible": col.n_feasible,
        "n_pareto": sum(1 for c in ranked if c.pareto),
        "seed": seed,
        "weights": weights_tried,
        "messages": messages,
    }
    return OptimizationOutcome(ranked, summary)


# ---------------------------------------------------------------------------
# nonlinear search
# ---------------------------------------------------------------------------


def _search_nonlinear(
    prob: _Problem,
    col: _Collector,
    rng: np.random.Generator,
    n_starts: int,
    n_cand: int,
    progress_cb: Any,
    cancel_cb: Any,
    weights_tried: list[Any],
    messages: list[str],
) -> None:
    objs = prob.objs
    K = len(objs)
    lin_idx = [k for k, o in enumerate(objs) if o.kind == "linear"]
    lin = [objs[k] for k in lin_idx]
    ref = np.zeros(K)
    scale = np.ones(K)
    anchors: list[np.ndarray | None] = []
    if lin:
        r_, s_, anchors = _linear_ranges(prob, lin)
        for q, k in enumerate(lin_idx):
            ref[k], scale[k] = r_[q], s_[q]
    user_w = np.array([o.spec.weight for o in objs])
    user_w = user_w / user_w.sum()
    scale_set = [o.kind != "texture" for o in objs]

    # starting vertices (computed before the loop so the total is fixed)
    vertices: list[np.ndarray | None] = []
    for s in range(n_starts):
        if s == 0 and lin:
            vertices.append(
                prob.scalar_lp(
                    lin, [float(user_w[k]) for k in lin_idx], ref[lin_idx], scale[lin_idx]
                )
            )
        else:
            vertices.append(prob.lp_direction(rng.normal(size=prob.n))[0])
    start_w = [user_w] + [
        rng.dirichlet(np.ones(K)) * 0.5 + user_w * 0.5 if K > 1 else user_w
        for _ in range(1, n_starts)
    ]

    def zval(k: int, x: np.ndarray) -> float | None:
        o = objs[k]
        nat = prob.nat(o, x)
        if nat is None:
            return None
        if o.spec.direction == "target":
            z = (nat - float(o.spec.value or 0.0)) / scale[k]
            return float(z * z)
        return float((o.sign * nat - ref[k]) / scale[k])

    def F(x: np.ndarray, w: np.ndarray) -> float | None:
        tot = 0.0
        for k in range(K):
            z = zval(k, x)
            if z is None:
                return None
            tot += float(w[k]) * z
        return tot

    cons = (
        [
            {
                "type": "ineq",
                "fun": lambda x: (prob.b - prob.A @ x) / prob.scale,
                "jac": lambda x: -prob.A / prob.scale[:, None],
            }
        ]
        if len(prob.b)
        else []
    )
    cons.append({"type": "eq", "fun": lambda x: x.sum() - 100.0, "jac": lambda x: np.ones(prob.n)})
    bounds = prob._bounds()

    for s in range(n_starts):
        if cancel_cb is not None and cancel_cb():
            raise OptimizationCancelled()
        x0 = vertices[s]
        if x0 is not None:
            # fix scales of black-box objectives from the first usable start
            for k in range(K):
                if not scale_set[k]:
                    nat = prob.nat(objs[k], x0)
                    if nat is not None:
                        ref_val = (
                            float(objs[k].spec.value or 0.0)
                            if objs[k].spec.direction == "target"
                            else abs(nat)
                        )
                        scale[k] = max(abs(ref_val), 1.0)
                        scale_set[k] = True
            w = start_w[s]
            weights_tried.append([float(v) for v in w])
            f0 = F(x0, w)
            if f0 is not None:
                best = x0
                try:
                    res = minimize(
                        lambda x, w=w: _penalised(F(x, w)),
                        x0,
                        method="SLSQP",
                        bounds=bounds,
                        constraints=cons,
                        options={"maxiter": 100, "ftol": 1e-9},
                    )
                    xr = np.clip(res.x, prob.lb, prob.ub)
                    fr = F(xr, w)
                    if fr is not None and fr <= f0 and prob.round_candidate(xr) is not None:
                        best = xr
                    messages.append(f"start {s}: {res.message}")
                except (ValueError, FloatingPointError) as e:  # pragma: no cover
                    messages.append(f"start {s}: {e}")
                col.add(best, s)
            else:
                messages.append(f"start {s}: predictor returned no value; start skipped")
        else:
            messages.append(f"start {s}: no feasible vertex")
        if progress_cb:
            progress_cb(s + 1, n_starts)


def _penalised(f: float | None) -> float:
    return _FAIL_PENALTY if f is None else f
