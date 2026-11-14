import type {
  Formulation,
  FormulationVersion,
  NutritionResult,
  NutrientValue,
} from "@/types";

/** Mock formulations. Names and values are synthetic. */

export const MOCK_FORMULATIONS: Formulation[] = [
  {
    id: "mock-formulation-1",
    name: "Mock blend A (synthetic)",
    version: 2,
    lines: [
      { ingredient_id: "mock-cowpea", percent: 45 },
      { ingredient_id: "mock-sorghum", percent: 30 },
      { ingredient_id: "mock-amaranth", percent: 25 },
    ],
    targets: { protein_g: 20, cost_ceiling_kes_per_kg: 300 },
    updated_at: "2026-11-14T09:00:00Z",
  },
  {
    id: "mock-formulation-2",
    name: "Mock blend B (synthetic)",
    version: 1,
    lines: [
      { ingredient_id: "mock-bambara", percent: 40 },
      { ingredient_id: "mock-pigeon-pea", percent: 35 },
      { ingredient_id: "mock-finger-millet", percent: 25 },
    ],
    updated_at: "2026-11-13T14:30:00Z",
  },
  {
    id: "mock-formulation-3",
    name: "Mock blend C (synthetic)",
    version: 1,
    lines: [
      { ingredient_id: "mock-green-gram", percent: 50 },
      { ingredient_id: "mock-lablab", percent: 30 },
      { ingredient_id: "mock-sorghum", percent: 20 },
    ],
    updated_at: "2026-11-12T11:15:00Z",
  },
];

export const MOCK_FORMULATIONS_BY_ID: Record<string, Formulation> =
  Object.fromEntries(MOCK_FORMULATIONS.map((f) => [f.id, f]));

export const MOCK_VERSIONS: Record<string, FormulationVersion[]> = {
  "mock-formulation-1": [
    {
      version: 2,
      author: "Mock Scientist",
      created_at: "2026-11-14T09:00:00Z",
      note: "Mock revision: swapped 5% sorghum for amaranth.",
      lines: [
        { ingredient_id: "mock-cowpea", percent: 45 },
        { ingredient_id: "mock-sorghum", percent: 30 },
        { ingredient_id: "mock-amaranth", percent: 25 },
      ],
    },
    {
      version: 1,
      author: "Mock Scientist",
      created_at: "2026-11-10T08:00:00Z",
      note: "Mock initial version.",
      lines: [
        { ingredient_id: "mock-cowpea", percent: 50 },
        { ingredient_id: "mock-sorghum", percent: 30 },
        { ingredient_id: "mock-amaranth", percent: 20 },
      ],
    },
  ],
};

function nutrient(
  key: string,
  value: number | null,
  unit: string,
  flag: NutrientValue["flag"] = "calculated",
): NutrientValue {
  return { key, value, unit, flag, contains_estimated: true };
}

export const MOCK_NUTRITION: Record<string, NutritionResult> = {
  "mock-formulation-1": {
    formulation_id: "mock-formulation-1",
    per_basis: "100 g",
    moisture_basis: "as-is",
    nutrients: [
      nutrient("protein_g", 17.4, "g/100 g"),
      nutrient("energy_kj", 1395, "kJ/100 g"),
      nutrient("fibre_g", 5.2, "g/100 g"),
      nutrient("iron_mg", null, "mg/100 g"),
    ],
    amino_acids: [
      nutrient("lysine", 0.94, "g/100 g"),
      nutrient("methionine", 0.24, "g/100 g"),
      nutrient("tryptophan", null, "g/100 g"),
    ],
    limiting_amino_acid: "lysine",
    calculation_version: "mock-calc-v0",
    generated_at: "2026-11-14T09:05:00Z",
  },
  "mock-formulation-2": {
    formulation_id: "mock-formulation-2",
    per_basis: "100 g",
    moisture_basis: "as-is",
    nutrients: [
      nutrient("protein_g", 15.1, "g/100 g"),
      nutrient("energy_kj", 1420, "kJ/100 g"),
      nutrient("fibre_g", 6.1, "g/100 g"),
    ],
    amino_acids: [
      nutrient("lysine", 0.78, "g/100 g"),
      nutrient("methionine", 0.2, "g/100 g"),
    ],
    limiting_amino_acid: "methionine",
    calculation_version: "mock-calc-v0",
    generated_at: "2026-11-13T14:35:00Z",
  },
  "mock-formulation-3": {
    formulation_id: "mock-formulation-3",
    per_basis: "100 g",
    moisture_basis: "as-is",
    nutrients: [
      nutrient("protein_g", 18.9, "g/100 g"),
      nutrient("energy_kj", 1355, "kJ/100 g"),
      nutrient("fibre_g", 5.8, "g/100 g"),
    ],
    amino_acids: [
      nutrient("lysine", 1.12, "g/100 g"),
      nutrient("methionine", 0.26, "g/100 g"),
    ],
    limiting_amino_acid: null,
    calculation_version: "mock-calc-v0",
    generated_at: "2026-11-12T11:20:00Z",
  },
};
