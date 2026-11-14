"""Amino-acid score (AAS) against a versioned reference pattern (guide section 8.2).

DIAAS is intentionally not implemented.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from app.domain.nutrition import linear_coefficients
from app.domain.types import AminoAcidPattern, IngredientData, Line

CALC_VERSION = "aas-1.0.0"
_HUNDRED = Decimal(100)


def _f(v: Decimal | None) -> float | None:
    return None if v is None else float(v)


@dataclass
class AminoAcidResult:
    pattern: AminoAcidPattern
    per_g_protein_mg: dict[str, Decimal | None]
    scores: dict[str, Decimal | None]
    limiting_amino_acid: str | None
    score: Decimal | None
    complete: bool
    missing: list[str]

    def to_payload(self) -> dict[str, Any]:
        return {
            "per_g_protein_mg": [
                {"key": k, "value": _f(v)} for k, v in self.per_g_protein_mg.items()
            ],
            "reference_pattern": {
                "id": self.pattern.id,
                "name": self.pattern.name,
                "version": self.pattern.version,
            },
            "scores": [{"key": k, "score": _f(v)} for k, v in self.scores.items()],
            "limiting_amino_acid": self.limiting_amino_acid,
            "score": _f(self.score),
            "method": "AAS",
            "complete": self.complete,
            "missing": list(self.missing),
        }


def _members(pattern: AminoAcidPattern, key: str) -> list[str]:
    return list(pattern.groupings.get(key, [key]))


def score_amino_acids(
    lines: Sequence[Line],
    ingredients: Mapping[str, IngredientData],
    pattern: AminoAcidPattern,
) -> AminoAcidResult:
    """Score the mixture; missing data yields null scores and complete=False."""
    active = [ln for ln in lines if ln.percent > 0]
    ids = [ln.ingredient_id for ln in active]
    weights = [ln.percent / _HUNDRED for ln in active]

    def mixture(key: str, unit: str) -> Decimal | None:
        coefs = linear_coefficients(ingredients, ids, key, unit)
        if not coefs:
            return None
        total = Decimal(0)
        for w, c in zip(weights, coefs, strict=True):
            if c is None:
                return None
            total += w * c
        return total

    protein = mixture("protein", "g")
    per_g: dict[str, Decimal | None] = {}
    scores: dict[str, Decimal | None] = {}
    for key, ref in pattern.values.items():
        value: Decimal | None = None
        if protein is not None and protein > 0:
            parts = [mixture(m, "mg") for m in _members(pattern, key)]
            if parts and all(p is not None for p in parts):
                value = sum((p for p in parts if p is not None), Decimal(0)) / protein
        per_g[key] = value
        scores[key] = value / ref if value is not None and ref > 0 else None

    available = {k: s for k, s in scores.items() if s is not None}
    limiting = min(available, key=lambda k: available[k]) if available else None
    missing = [k for k, s in scores.items() if s is None]
    return AminoAcidResult(
        pattern=pattern,
        per_g_protein_mg=per_g,
        scores=scores,
        limiting_amino_acid=limiting,
        score=available[limiting] if limiting else None,
        complete=not missing and bool(scores),
        missing=missing,
    )


def per_gram_protein_coefficients(
    ingredients: Mapping[str, IngredientData],
    ingredient_ids: Sequence[str],
    pattern: AminoAcidPattern,
) -> dict[str, list[Decimal | None]]:
    """Linear coefficients for the constraint "mixture mg/g protein >= R_a".

    With aa in mg/100 g and protein in g/100 g, and ingredient fractions x_i, the
    mixture meets R_a iff sum_i x_i * c_i >= 0 where c_i = aa_i - R_a * protein_i.
    Group keys sum their members. An entry is None if any needed value is missing.
    """
    protein = linear_coefficients(ingredients, ingredient_ids, "protein", "g")
    out: dict[str, list[Decimal | None]] = {}
    for key, ref in pattern.values.items():
        cols = [
            linear_coefficients(ingredients, ingredient_ids, m, "mg")
            for m in _members(pattern, key)
        ]
        col: list[Decimal | None] = []
        for i, p in enumerate(protein):
            aas = [c[i] for c in cols]
            if p is None or any(a is None for a in aas):
                col.append(None)
            else:
                col.append(sum((a for a in aas if a is not None), Decimal(0)) - ref * p)
        out[key] = col
    return out
