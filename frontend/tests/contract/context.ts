import type { Formulation } from "@/types";
import { listIngredients } from "@/lib/api/ingredients";
import { createFormulation, saveFormulation } from "@/lib/api/formulations";

let cached: Promise<Formulation> | null = null;

/**
 * A real, saved formulation with two ingredient lines, created once per test
 * file. Every suite that needs a formulation shares this instead of building
 * its own draft.
 */
export function testFormulation(): Promise<Formulation> {
  cached ??= build();
  return cached;
}

async function build(): Promise<Formulation> {
  const ingredients = await listIngredients({ page_size: 5 });
  if (ingredients.items.length < 2) {
    throw new Error(
      "the catalogue has fewer than two ingredients; seed the reference data first",
    );
  }
  const draft = await createFormulation({
    name: `contract-test-${new Date().toISOString()}`,
  });
  const lines = [60, 40].map((percent, index) => ({
    ingredient_id: ingredients.items[index].id,
    percent,
  }));
  return saveFormulation(draft.id, { base_version: draft.version, lines });
}
