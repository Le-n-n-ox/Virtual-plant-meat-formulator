import type { IngredientListItem, Paginated } from "@/types";
import { requestJson } from "./client";

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
  return requestJson<Paginated<IngredientListItem>>(
    `/api/ingredients${query ? `?${query}` : ""}`,
  );
}
