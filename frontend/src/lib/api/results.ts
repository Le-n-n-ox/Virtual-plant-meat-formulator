import type { CompareResponse, NutritionResult } from "@/types";
import { buildQuery, requestValidated } from "./client";
import {
  compareResponseSchema,
  nutritionResultSchema,
} from "@/lib/validation/schemas";

export function getNutrition(formulationId: string): Promise<NutritionResult> {
  return requestValidated(
    `/api/formulations/${encodeURIComponent(formulationId)}/nutrition`,
    nutritionResultSchema,
  );
}

/** Side-by-side comparison of two candidates (page 11). */
export function compareCandidates(
  idA: string,
  idB: string,
): Promise<CompareResponse> {
  return requestValidated(
    `/api/compare${buildQuery({ ids: `${idA},${idB}` })}`,
    compareResponseSchema,
  );
}
