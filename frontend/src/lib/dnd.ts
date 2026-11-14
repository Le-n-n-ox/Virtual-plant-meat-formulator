import type { Ingredient } from "@/types";

/**
 * Shared drag-and-drop contract for ingredients. The custom MIME type carries
 * the id; `text/plain` is a human-readable fallback for non-DnD targets.
 */
export const INGREDIENT_MIME = "application/x-vpmf-ingredient";

export function setIngredientDragData(
  event: React.DragEvent,
  ingredient: Pick<Ingredient, "id" | "common_name">,
): void {
  event.dataTransfer.setData(INGREDIENT_MIME, ingredient.id);
  event.dataTransfer.setData("text/plain", ingredient.common_name);
  event.dataTransfer.effectAllowed = "copy";
}

export function getIngredientDragId(event: React.DragEvent): string | null {
  return event.dataTransfer.getData(INGREDIENT_MIME) || null;
}

/** True when the current drag payload carries an ingredient id. */
export function isIngredientDrag(event: React.DragEvent): boolean {
  return event.dataTransfer.types.includes(INGREDIENT_MIME);
}
