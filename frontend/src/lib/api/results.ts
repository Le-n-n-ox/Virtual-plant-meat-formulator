import type { NutritionResult } from "@/types";
import { buildQuery, requestJson } from "./client";

export type {
  AminoAcidBlock,
  NutritionResult,
  TextureResult,
  TexturePrediction,
} from "@/types";

export function getNutrition(
  formulationId: string,
  version?: number,
): Promise<NutritionResult> {
  return requestJson(
    `/api/formulations/${encodeURIComponent(formulationId)}/nutrition${buildQuery({ version })}`,
  );
}

export const resultsApi = { getNutrition };
export type ResultsApi = typeof resultsApi;
