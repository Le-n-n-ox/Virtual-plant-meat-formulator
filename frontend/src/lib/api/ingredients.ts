import type {
  AminoAcidPattern,
  FacetEntry,
  IngredientDetail,
  IngredientFacets,
  IngredientListItem,
  NutrientDefinition,
  Paged,
} from "@/types";
import { buildQuery, requestJson } from "./client";
import {
  ingredientDetailSchema,
  ingredientFacetsSchema,
  ingredientListItemSchema,
  listOrPaged,
  nutrientDefinitionSchema,
  aminoAcidPatternSchema,
  pagedSchema,
} from "@/lib/validation/schemas";

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

export type {
  AminoAcidPattern,
  FacetEntry,
  IngredientFacets,
  NutrientDefinition,
};

export function listIngredients(
  params: IngredientListParams = {},
): Promise<Paged<IngredientListItem>> {
  return requestJson(
    `/api/ingredients${buildQuery({ ...params })}`,
    undefined,
    pagedSchema(ingredientListItemSchema),
  );
}

export function getIngredient(id: string): Promise<IngredientDetail> {
  return requestJson(
    `/api/ingredients/${encodeURIComponent(id)}`,
    undefined,
    ingredientDetailSchema,
  );
}

export function getIngredientFacets(): Promise<IngredientFacets> {
  return requestJson(
    "/api/ingredients/facets",
    undefined,
    ingredientFacetsSchema,
  );
}

export function listNutrients(): Promise<
  NutrientDefinition[] | { items: NutrientDefinition[] }
> {
  return requestJson(
    "/api/nutrients",
    undefined,
    listOrPaged(nutrientDefinitionSchema),
  );
}

export function listAminoAcidPatterns(): Promise<
  AminoAcidPattern[] | { items: AminoAcidPattern[] }
> {
  return requestJson(
    "/api/amino-acid-patterns",
    undefined,
    listOrPaged(aminoAcidPatternSchema),
  );
}

export const ingredientsApi = {
  listIngredients,
  getIngredient,
  getIngredientFacets,
  listNutrients,
  listAminoAcidPatterns,
};
export type IngredientsApi = typeof ingredientsApi;
