"""Formulation validation, implemented once for /validate, PUT and job start."""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Any

from app.domain.types import IngredientData, Line

TOTAL_TOLERANCE = Decimal("0.01")
_HUNDRED = Decimal(100)


@dataclass
class ValidationIssue:
    code: str
    message: str
    ingredient_id: str | None = None
    details: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"code": self.code, "message": self.message}
        if self.ingredient_id is not None:
            out["ingredient_id"] = self.ingredient_id
        if self.details:
            out["details"] = self.details
        return out


@dataclass
class ValidationResult:
    valid: bool
    total_percent: Decimal
    issues: list[ValidationIssue]

    def to_dict(self) -> dict[str, Any]:
        return {
            "valid": self.valid,
            "total_percent": float(self.total_percent),
            "issues": [i.to_dict() for i in self.issues],
        }


def _fmt(d: Decimal) -> str:
    return format(d.normalize(), "f")


def _to_decimal(x: Any) -> Decimal | None:
    if isinstance(x, bool):
        return None
    try:
        d = Decimal(str(x))
    except InvalidOperation, ValueError:
        return None
    return d if d.is_finite() else None


def _line_parts(line: Line | Mapping[str, Any]) -> tuple[Any, Any]:
    if isinstance(line, Mapping):
        return line.get("ingredient_id"), line.get("percent")
    return line.ingredient_id, line.percent


def _bound_issues(targets: Mapping[str, Any]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []

    def contradictory(key: str, lo: Decimal, hi: Decimal) -> None:
        issues.append(
            ValidationIssue(
                "bound_violation",
                f"Target {key}: minimum {_fmt(lo)} is above maximum {_fmt(hi)}.",
                details={"target": key, "min": float(lo), "max": float(hi)},
            )
        )

    for key, spec in targets.items():
        if not isinstance(spec, Mapping):
            continue
        for name in ("min", "max"):
            if spec.get(name) is not None and _to_decimal(spec[name]) is None:
                issues.append(
                    ValidationIssue(
                        "bound_violation",
                        f"Target {key}: {name} is not a number.",
                        details={"target": key, "bound": name},
                    )
                )
        lo, hi = _to_decimal(spec.get("min")), _to_decimal(spec.get("max"))
        if lo is not None and hi is not None and lo > hi:
            contradictory(key, lo, hi)
    for key in targets:
        if key.endswith("_min"):
            base = key[: -len("_min")]
            lo, hi = _to_decimal(targets[key]), _to_decimal(targets.get(base + "_max"))
            if lo is not None and hi is not None and lo > hi:
                contradictory(base, lo, hi)
    return issues


def validate_formulation(
    lines: Sequence[Line | Mapping[str, Any]],
    ingredients: Mapping[str, IngredientData],
    targets: Mapping[str, Any] | None = None,
    *,
    new_version: bool = True,
) -> ValidationResult:
    """Validate lines (and optional targets); issues are in line order, then global."""
    issues: list[ValidationIssue] = []
    total = Decimal(0)
    seen: set[str] = set()
    reported_dup: set[str] = set()

    for line in lines:
        raw_id, raw_pct = _line_parts(line)
        ing_id = None if raw_id is None else str(raw_id)
        pct = _to_decimal(raw_pct)
        if pct is None or pct <= 0 or pct > _HUNDRED:
            issues.append(
                ValidationIssue(
                    "percent_out_of_range",
                    f"Percentage {raw_pct!r} must be greater than 0 and at most 100.",
                    ing_id,
                )
            )
        if pct is not None:
            total += pct
        if ing_id is None:
            continue
        if ing_id in seen:
            if ing_id not in reported_dup:
                reported_dup.add(ing_id)
                issues.append(
                    ValidationIssue(
                        "duplicate_ingredient",
                        f"Ingredient {ing_id} appears more than once.",
                        ing_id,
                    )
                )
            continue
        seen.add(ing_id)
        ing = ingredients.get(ing_id)
        if ing is None:
            issues.append(
                ValidationIssue("unknown_ingredient", f"Unknown ingredient {ing_id}.", ing_id)
            )
            continue
        if new_version and ing.status == "retired":
            issues.append(
                ValidationIssue(
                    "ingredient_retired",
                    f"Ingredient {ing_id} is retired and cannot be added to a new version.",
                    ing_id,
                )
            )
        dry_rows = sorted(k for k, r in ing.nutrients.items() if r.per_basis == "per_100g_dry")
        if ing.moisture_percent is None and (ing.moisture_basis == "dry" or dry_rows):
            issues.append(
                ValidationIssue(
                    "unit_or_basis_mismatch",
                    f"Ingredient {ing_id} has dry-basis data but no moisture_percent.",
                    ing_id,
                    {"nutrients": dry_rows} if dry_rows else {},
                )
            )

    if abs(total - _HUNDRED) > TOTAL_TOLERANCE:
        issues.append(
            ValidationIssue("total_not_100", f"Percentages total {_fmt(total)}, expected 100.")
        )
    if targets:
        issues.extend(_bound_issues(targets))
    return ValidationResult(valid=not issues, total_percent=total, issues=issues)
