import type { Metadata } from "next";
import { Suspense } from "react";
import { IngredientCatalogue } from "@/components/ingredients/ingredient-catalogue";

export const metadata: Metadata = { title: "Ingredients" };

export default function IngredientsPage() {
  // The catalogue reads its filters from the address bar, which needs a
  // Suspense boundary for a statically rendered route.
  return (
    <Suspense>
      <IngredientCatalogue />
    </Suspense>
  );
}
