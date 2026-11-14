import type { Ingredient, IngredientListItem, NutrientValue } from "@/types";

/**
 * MOCK CATALOGUE — synthetic fixture data.
 *
 * These records exist only so the catalogue, editor and mock API have something
 * to render. Every value is flagged `estimated` and every source says "Mock
 * data — not real". Never present these numbers as measured composition.
 */

export const MOCK_SOURCE = {
  name: "Mock data — not real",
  method: "synthetic fixture",
  date: "2026-11-14",
  license_status: "mock / no licence",
} as const;

export const MOCK_SOURCE_ID = "mock-source";

function nutrient(
  key: string,
  value: number | null,
  unit: string,
  range?: [number, number],
): NutrientValue {
  return {
    key,
    value,
    unit,
    flag: "estimated",
    range,
    reason: value === null ? "Not reported in the mock fixture." : undefined,
    contains_estimated: true,
  };
}

interface MockCrop {
  id: string;
  common_name: string;
  scientific_name: string;
  form: Ingredient["form"];
  origin: string;
  moisture_basis: string;
  protein: number;
  energy: number;
  fibre: number;
  lysine: number | null;
  methionine: number | null;
}

const CROPS: MockCrop[] = [
  {
    id: "mock-cowpea",
    common_name: "Cowpea",
    scientific_name: "Vigna unguiculata",
    form: "flour",
    origin: "Kenya (mock)",
    moisture_basis: "as-is",
    protein: 23.5,
    energy: 1380,
    fibre: 5.1,
    lysine: 1.62,
    methionine: 0.28,
  },
  {
    id: "mock-bambara",
    common_name: "Bambara groundnut",
    scientific_name: "Vigna subterranea",
    form: "flour",
    origin: "Kenya (mock)",
    moisture_basis: "as-is",
    protein: 19.8,
    energy: 1520,
    fibre: 6.3,
    lysine: 1.1,
    methionine: 0.22,
  },
  {
    id: "mock-amaranth",
    common_name: "Amaranth grain",
    scientific_name: "Amaranthus spp.",
    form: "raw",
    origin: "Kenya (mock)",
    moisture_basis: "as-is",
    protein: 13.6,
    energy: 1490,
    fibre: 6.7,
    lysine: 0.72,
    methionine: null,
  },
  {
    id: "mock-sorghum",
    common_name: "Sorghum",
    scientific_name: "Sorghum bicolor",
    form: "flour",
    origin: "Kenya (mock)",
    moisture_basis: "as-is",
    protein: 10.6,
    energy: 1410,
    fibre: 4.4,
    lysine: 0.31,
    methionine: 0.19,
  },
  {
    id: "mock-finger-millet",
    common_name: "Finger millet",
    scientific_name: "Eleusine coracana",
    form: "flour",
    origin: "Kenya (mock)",
    moisture_basis: "as-is",
    protein: 7.3,
    energy: 1330,
    fibre: 3.6,
    lysine: 0.24,
    methionine: 0.17,
  },
  {
    id: "mock-pigeon-pea",
    common_name: "Pigeon pea",
    scientific_name: "Cajanus cajan",
    form: "soaked",
    origin: "Kenya (mock)",
    moisture_basis: "as-is",
    protein: 21.7,
    energy: 1360,
    fibre: 5.9,
    lysine: 1.45,
    methionine: 0.25,
  },
  {
    id: "mock-green-gram",
    common_name: "Green gram",
    scientific_name: "Vigna radiata",
    form: "raw",
    origin: "Kenya (mock)",
    moisture_basis: "as-is",
    protein: 24.0,
    energy: 1390,
    fibre: 5.4,
    lysine: 1.7,
    methionine: 0.3,
  },
  {
    id: "mock-lablab",
    common_name: "Lablab bean",
    scientific_name: "Lablab purpureus",
    form: "cooked",
    origin: "Kenya (mock)",
    moisture_basis: "as-is",
    protein: 18.2,
    energy: 1280,
    fibre: 7.0,
    lysine: 1.25,
    methionine: 0.21,
  },
];

export const MOCK_INGREDIENTS: Ingredient[] = CROPS.map((crop) => ({
  id: crop.id,
  scientific_name: crop.scientific_name,
  common_name: crop.common_name,
  form: crop.form,
  origin: crop.origin,
  moisture_basis: crop.moisture_basis,
  nutrients: [
    nutrient("protein_g", crop.protein, "g/100 g", [
      crop.protein * 0.9,
      crop.protein * 1.1,
    ]),
    nutrient("energy_kj", crop.energy, "kJ/100 g"),
    nutrient("fibre_g", crop.fibre, "g/100 g"),
    nutrient("iron_mg", null, "mg/100 g"),
  ],
  amino_acids: [
    nutrient("lysine", crop.lysine, "g/100 g protein"),
    nutrient("methionine", crop.methionine, "g/100 g protein"),
    nutrient("tryptophan", null, "g/100 g protein"),
  ],
  source: MOCK_SOURCE,
}));

export const MOCK_INGREDIENTS_BY_ID: Record<string, Ingredient> =
  Object.fromEntries(
    MOCK_INGREDIENTS.map((ingredient) => [ingredient.id, ingredient]),
  );

export const MOCK_INGREDIENT_LIST: IngredientListItem[] = MOCK_INGREDIENTS.map(
  (ingredient) => {
    const protein = ingredient.nutrients.find((n) => n.key === "protein_g");
    return {
      id: ingredient.id,
      scientific_name: ingredient.scientific_name,
      common_name: ingredient.common_name,
      form: ingredient.form,
      origin: ingredient.origin,
      moisture_basis: ingredient.moisture_basis,
      source: { id: MOCK_SOURCE_ID, name: ingredient.source.name },
      quality_flag: "estimated",
      protein_g_per_100g: protein?.value ?? null,
      has_amino_acids: ingredient.amino_acids.length > 0,
    };
  },
);

export const MOCK_CROP_NAMES = CROPS.map((crop) => crop.common_name);
