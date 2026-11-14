import type { Metadata } from "next";
import { IngredientDetailView } from "@/components/ingredients/ingredient-detail";

export const metadata: Metadata = { title: "Ingredient" };

export default function IngredientDetailPage() {
  return <IngredientDetailView />;
}
