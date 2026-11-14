import type { Formulation, Ingredient } from "@/types";

/**
 * DEMO FIXTURES — not real data.
 * Crop names are real indigenous Kenyan crops, but these records deliberately
 * carry NO nutrient values. They exist only to drive the scene and editor
 * before the ingredient catalogue API is available.
 */
const DEMO_SOURCE = {
  name: "Demo fixture (not real data)",
  method: "n/a",
  license_status: "n/a — placeholder",
};

function demo(
  id: string,
  common_name: string,
  scientific_name: string,
  form: Ingredient["form"],
): Ingredient {
  return {
    id,
    common_name,
    scientific_name,
    form,
    origin: "Kenya (demo)",
    moisture_basis: "as-is",
    nutrients: [],
    amino_acids: [],
    source: DEMO_SOURCE,
  };
}

export const DEMO_INGREDIENTS: Ingredient[] = [
  demo("demo-cowpea", "Cowpea", "Vigna unguiculata", "flour"),
  demo("demo-bambara", "Bambara groundnut", "Vigna subterranea", "flour"),
  demo("demo-amaranth", "Amaranth grain", "Amaranthus spp.", "flour"),
  demo("demo-sorghum", "Sorghum", "Sorghum bicolor", "flour"),
  demo("demo-finger-millet", "Finger millet", "Eleusine coracana", "flour"),
  demo("demo-pigeon-pea", "Pigeon pea", "Cajanus cajan", "soaked"),
  demo("demo-green-gram", "Green gram", "Vigna radiata", "flour"),
  demo("demo-lablab", "Lablab bean", "Lablab purpureus", "cooked"),
];

export const DEMO_FORMULATION: Formulation = {
  id: "demo",
  name: "Demo blend (illustrative)",
  version: 1,
  lines: [
    { ingredient_id: "demo-cowpea", percent: 45 },
    { ingredient_id: "demo-sorghum", percent: 30 },
    { ingredient_id: "demo-amaranth", percent: 25 },
  ],
  updated_at: "2026-11-14T00:00:00Z",
};
