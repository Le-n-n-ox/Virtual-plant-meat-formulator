import { beforeAll, describe, expect, it } from "vitest";
import {
  getIngredient,
  getIngredientFacets,
  listAminoAcidPatterns,
  listIngredients,
  listNutrients,
} from "@/lib/api/ingredients";
import {
  aminoAcidPatternSchema,
  ingredientDetailSchema,
  ingredientFacetsSchema,
  ingredientListItemSchema,
  listOrPaged,
  nutrientDefinitionSchema,
  pagedSchema,
} from "@/lib/validation/schemas";
import { contractAvailable, expectParses, signIn } from "./helpers";

describe.skipIf(!contractAvailable)("ingredients contract", () => {
  beforeAll(signIn);

  it("GET /api/ingredients returns a page of list items", async () => {
    const page = await listIngredients({ page_size: 5 });
    expectParses(
      pagedSchema(ingredientListItemSchema),
      page,
      "GET /api/ingredients",
    );
  });

  it("GET /api/ingredients/{id} returns the full record", async () => {
    const page = await listIngredients({ page_size: 1 });
    const first = page.items[0];
    expect(
      first,
      "the catalogue is empty; seed the reference data first",
    ).toBeTruthy();
    const detail = await getIngredient(first.id);
    expectParses(ingredientDetailSchema, detail, "GET /api/ingredients/{id}");
  });

  it("GET /api/ingredients/facets returns facet entries", async () => {
    expectParses(
      ingredientFacetsSchema,
      await getIngredientFacets(),
      "GET /api/ingredients/facets",
    );
  });

  it("GET /api/nutrients returns definitions", async () => {
    expectParses(
      listOrPaged(nutrientDefinitionSchema),
      await listNutrients(),
      "GET /api/nutrients",
    );
  });

  it("GET /api/amino-acid-patterns returns scoring patterns", async () => {
    expectParses(
      listOrPaged(aminoAcidPatternSchema),
      await listAminoAcidPatterns(),
      "GET /api/amino-acid-patterns",
    );
  });
});
