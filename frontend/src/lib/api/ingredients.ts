import type { Ingredient, IngredientListItem, Paginated } from "@/types";
import { requestValidated } from "./client";
import {
  ingredientDetailSchema,
  ingredientListItemSchema,
  paginatedSchema,
} from "@/lib/validation/schemas";

export type IngredientListParams = {
  q?: string;
  crop?: string;
  form?: string;
  source?: string;
  flag?: "analytical" | "estimated";
  status?: "active" | "draft" | "retired";
  sort?: string;
  page?: number;
  page_size?: number;
};

export function getIngredients(
  params: IngredientListParams = {},
): Promise<Paginated<IngredientListItem>> {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      searchParams.set(key, String(value));
    }
  }

  const query = searchParams.toString();
  return requestValidated(
    `/api/ingredients${query ? `?${query}` : ""}`,
    paginatedSchema(ingredientListItemSchema),
  );
}

export function getIngredient(id: string): Promise<Ingredient> {
  return requestValidated(
    `/api/ingredients/${encodeURIComponent(id)}`,
    ingredientDetailSchema,
  );
}
