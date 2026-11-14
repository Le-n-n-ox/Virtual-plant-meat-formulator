import type {
  Candidate,
  CandidateDetail,
  Formulation,
  TexturePredictionResult,
} from "@/types";
import { MOCK_MODELS_BY_ID } from "./models";
import { MOCK_NUTRITION } from "./formulations";

/** Mock optimization output. Candidates are synthetic. */

export const MOCK_CANDIDATES: Record<string, Candidate[]> = {
  "mock-formulation-1": [
    {
      id: "mock-candidate-1",
      formulation_id: "mock-formulation-1",
      name: "Mock candidate 1",
      lines: [
        { ingredient_id: "mock-cowpea", percent: 45 },
        { ingredient_id: "mock-sorghum", percent: 30 },
        { ingredient_id: "mock-amaranth", percent: 25 },
      ],
      metrics: { protein_g: 17.4, hardness_n: 24.5, chewiness: 0.62 },
      cost_per_kg: 285,
      model: MOCK_MODELS_BY_ID["mock-model-optimization"],
      created_at: "2026-11-14T09:10:00Z",
    },
    {
      id: "mock-candidate-2",
      formulation_id: "mock-formulation-1",
      name: "Mock candidate 2",
      lines: [
        { ingredient_id: "mock-cowpea", percent: 40 },
        { ingredient_id: "mock-sorghum", percent: 35 },
        { ingredient_id: "mock-amaranth", percent: 25 },
      ],
      metrics: { protein_g: 16.8, hardness_n: 22.1, chewiness: 0.58 },
      cost_per_kg: 262,
      model: MOCK_MODELS_BY_ID["mock-model-optimization"],
      created_at: "2026-11-14T09:11:00Z",
    },
    {
      id: "mock-candidate-3",
      formulation_id: "mock-formulation-1",
      name: "Mock candidate 3",
      lines: [
        { ingredient_id: "mock-cowpea", percent: 50 },
        { ingredient_id: "mock-sorghum", percent: 25 },
        { ingredient_id: "mock-amaranth", percent: 25 },
      ],
      metrics: { protein_g: 18.2, hardness_n: 27.3, chewiness: 0.66 },
      cost_per_kg: 301,
      model: MOCK_MODELS_BY_ID["mock-model-optimization"],
      created_at: "2026-11-14T09:12:00Z",
    },
  ],
};

const MOCK_TEXTURE: TexturePredictionResult = {
  formulation_id: "mock-formulation-1",
  predictions: [
    {
      target: "hardness",
      value: 24.5,
      unit: "N",
      interval: [21.5, 27.5],
      model: MOCK_MODELS_BY_ID["mock-model-texture"],
    },
    {
      target: "chewiness",
      value: 0.62,
      unit: "ratio",
      model: MOCK_MODELS_BY_ID["mock-model-texture"],
    },
  ],
  limitations: [
    "Mock model: synthetic holdout only.",
    "Interval is illustrative, not a calibrated prediction interval.",
  ],
  generated_at: "2026-11-14T09:15:00Z",
};

export const MOCK_CANDIDATE_DETAILS: Record<string, CandidateDetail> =
  Object.fromEntries(
    (MOCK_CANDIDATES["mock-formulation-1"] ?? []).map((candidate) => [
      candidate.id,
      {
        ...candidate,
        nutrition: MOCK_NUTRITION[candidate.formulation_id] ?? null,
        texture: MOCK_TEXTURE,
      },
    ]),
  );

export const MOCK_PROMOTED: Formulation = {
  id: "mock-formulation-promoted",
  name: "Promoted mock candidate",
  version: 1,
  lines: MOCK_CANDIDATES["mock-formulation-1"][0].lines,
  updated_at: "2026-11-14T09:20:00Z",
};
