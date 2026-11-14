import type { FormulationLine, ValidationResult } from "@/types";

/**
 * Client-side mirror of the backend formulation rules, used for instant
 * feedback before sending changes to the API. The backend `/validate` result
 * is authoritative whenever it is available.
 */
export const TOTAL_TOLERANCE = 0.01;

export function validateFormulationLocally(
  lines: FormulationLine[],
): ValidationResult {
  const issues: ValidationResult["issues"] = [];
  let total = 0;

  for (const line of lines) {
    if (
      !Number.isFinite(line.percent) ||
      line.percent < 0 ||
      line.percent > 100
    ) {
      issues.push({
        ingredient_id: line.ingredient_id,
        code: "percent_out_of_range",
        message: "Percentage must be between 0 and 100.",
      });
      continue;
    }
    total += line.percent;
  }

  total = Math.round(total * 1000) / 1000;

  if (lines.length === 0) {
    issues.push({ code: "empty", message: "Add at least one ingredient." });
  } else if (Math.abs(total - 100) > TOTAL_TOLERANCE) {
    issues.push({
      code: "total_not_100",
      message: `Ingredient percentages total ${total}% — they must add up to 100%.`,
    });
  }

  return { valid: issues.length === 0, total_percent: total, issues };
}
