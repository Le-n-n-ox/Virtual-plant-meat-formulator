import type { IngredientDetail, IngredientListItem, Paged } from "@/types";
import { buildQuery, requestJson } from "./client";

export interface IngredientListParams {
  q?: string;
  crop?: string;
  form?: string;
  source_id?: string;
  flag?: "analytical" | "estimated";
  status?: string;
  /** Hide the source's meat, fish and dairy food groups. */
  exclude_animal_groups?: boolean;
  sort?: string;
  page?: number;
  page_size?: number;
}

export interface FacetEntry {
  value?: string;
  id?: string;
  name?: string;
  count: number;
}

export interface IngredientFacets {
  crops: FacetEntry[];
  forms: FacetEntry[];
  sources: FacetEntry[];
}

export interface NutrientDefinition {
  key: string;
  name: string;
  unit: string;
  kind: string;
}

export interface AminoAcidPattern {
  id: string;
  name: string;
  version?: string;
  is_default?: boolean;
  [key: string]: unknown;
}

export function listIngredients(
  params: IngredientListParams = {},
): Promise<Paged<IngredientListItem>> {
  return requestJson(`/api/ingredients${buildQuery({ ...params })}`);
}

export function getIngredient(id: string): Promise<IngredientDetail> {
  return requestJson(`/api/ingredients/${encodeURIComponent(id)}`);
}

export function getIngredientFacets(): Promise<IngredientFacets> {
  return requestJson("/api/ingredients/facets");
}

export function listNutrients(): Promise<
  NutrientDefinition[] | { items: NutrientDefinition[] }
> {
  return requestJson("/api/nutrients");
}

export function listAminoAcidPatterns(): Promise<
  AminoAcidPattern[] | { items: AminoAcidPattern[] }
> {
  return requestJson("/api/amino-acid-patterns");
}

export const ingredientsApi = {
  listIngredients,
  getIngredient,
  getIngredientFacets,
  listNutrients,
  listAminoAcidPatterns,
};
export type IngredientsApi = typeof ingredientsApi;
