import type {
  Formulation,
  FormulationLine,
  FormulationVersionSummary,
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

/** Version summary plus the lines, so the single-version endpoint can rebuild a full formulation. */
export interface MockFormulationVersion extends FormulationVersionSummary {
  lines: FormulationLine[];
}

export const MOCK_VERSIONS: Record<string, MockFormulationVersion[]> = {
  "mock-formulation-1": [
    {
      version: 2,
      created_by: "Mock Scientist",
      created_at: "2026-11-14T09:00:00Z",
      note: "Mock revision: swapped 5% sorghum for amaranth.",
      content_hash: "mock-hash-v2",
      lines: [
        { ingredient_id: "mock-cowpea", percent: 45 },
        { ingredient_id: "mock-sorghum", percent: 30 },
        { ingredient_id: "mock-amaranth", percent: 25 },
      ],
    },
    {
      version: 1,
      created_by: "Mock Scientist",
      created_at: "2026-11-10T08:00:00Z",
      note: "Mock initial version.",
      content_hash: "mock-hash-v1",
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

const REFERENCE_PATTERN = {
  id: "fao-2013",
  name: "FAO 2013 (adult)",
  version: "2013",
} as const;

interface AminoAcids {
  per_g_protein_mg: { key: string; value: number | null }[];
  scores: { key: string; score: number | null }[];
  limiting_amino_acid: string | null;
  score: number | null;
}

function aminoAcids(input: AminoAcids): NutritionResult["amino_acids"] {
  return {
    per_g_protein_mg: input.per_g_protein_mg,
    reference_pattern: REFERENCE_PATTERN,
    scores: input.scores,
    limiting_amino_acid: input.limiting_amino_acid,
    score: input.score,
    method: "mock-calc-v0 (synthetic)",
    complete: true,
    missing: [],
  };
}

export const MOCK_NUTRITION: Record<string, NutritionResult> = {
  "mock-formulation-1": {
    basis: "100 g",
    nutrients: [
      nutrient("protein_g", 17.4, "g/100 g"),
      nutrient("energy_kj", 1395, "kJ/100 g"),
      nutrient("fibre_g", 5.2, "g/100 g"),
      nutrient("iron_mg", null, "mg/100 g"),
    ],
    amino_acids: aminoAcids({
      per_g_protein_mg: [
        { key: "lysine", value: 54.0 },
        { key: "methionine", value: 13.8 },
        { key: "tryptophan", value: null },
      ],
      scores: [
        { key: "lysine", score: 0.82 },
        { key: "methionine", score: 0.86 },
      ],
      limiting_amino_acid: "lysine",
      score: 0.82,
    }),
    calc_version: "mock-calc-v0",
    data_versions: { ingredients: "mock-dataset-v0" },
    finished_at: "2026-11-14T09:05:00Z",
  },
  "mock-formulation-2": {
    basis: "100 g",
    nutrients: [
      nutrient("protein_g", 15.1, "g/100 g"),
      nutrient("energy_kj", 1420, "kJ/100 g"),
      nutrient("fibre_g", 6.1, "g/100 g"),
    ],
    amino_acids: aminoAcids({
      per_g_protein_mg: [
        { key: "lysine", value: 51.7 },
        { key: "methionine", value: 13.2 },
      ],
      scores: [
        { key: "lysine", score: 0.79 },
        { key: "methionine", score: 0.83 },
      ],
      limiting_amino_acid: "methionine",
      score: 0.79,
    }),
    calc_version: "mock-calc-v0",
    data_versions: { ingredients: "mock-dataset-v0" },
    finished_at: "2026-11-13T14:35:00Z",
  },
  "mock-formulation-3": {
    basis: "100 g",
    nutrients: [
      nutrient("protein_g", 18.9, "g/100 g"),
      nutrient("energy_kj", 1355, "kJ/100 g"),
      nutrient("fibre_g", 5.8, "g/100 g"),
    ],
    amino_acids: aminoAcids({
      per_g_protein_mg: [
        { key: "lysine", value: 59.3 },
        { key: "methionine", value: 13.8 },
      ],
      scores: [
        { key: "lysine", score: 0.9 },
        { key: "methionine", score: 0.88 },
      ],
      limiting_amino_acid: null,
      score: 0.9,
    }),
    calc_version: "mock-calc-v0",
    data_versions: { ingredients: "mock-dataset-v0" },
    finished_at: "2026-11-12T11:20:00Z",
  },
};
