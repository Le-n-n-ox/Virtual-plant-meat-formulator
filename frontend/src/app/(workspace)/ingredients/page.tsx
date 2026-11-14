import type { Metadata } from "next";
import { IngredientCatalogue } from "@/components/ingredients/ingredient-catalogue";

export const metadata: Metadata = { title: "Ingredients" };

export default function IngredientsPage() {
  return <IngredientCatalogue />;
}
