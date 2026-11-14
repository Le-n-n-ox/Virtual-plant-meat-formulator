import type {
  Candidate,
  CandidateScene,
  Formulation,
  ModelMeta,
  ModelRecord,
  NutritionResult,
  TexturePrediction,
  TextureResult,
} from "@/types";
import { MOCK_MODELS_BY_ID } from "./models";
import { MOCK_NUTRITION } from "./formulations";

/** Mock optimization output. Candidates are synthetic. */

const textureModel = MOCK_MODELS_BY_ID["mock-model-texture"];
const optimizationModel = MOCK_MODELS_BY_ID["mock-model-optimization"];

function modelMeta(model: ModelRecord): ModelMeta {
  return {
    id: model.id,
    target: model.target,
    algorithm: model.algorithm,
    version: model.version,
    training_set_size: model.training_set_size,
    holdout_metric: model.holdout_metric ?? undefined,
  };
}

const TEXTURE_PREDICTIONS: TexturePrediction[] = [
  {
    target: "hardness",
    value: 24.5,
    unit: "N",
    interval: [21.5, 27.5],
    model: modelMeta(textureModel),
  },
  {
    target: "chewiness",
    value: 0.62,
    unit: "ratio",
    model: modelMeta(textureModel),
  },
];

const SCENE: CandidateScene = {
  visual_basis: "illustrative",
  variables: [
    {
      key: "hardness_n",
      derived_from_model: textureModel.id,
      validated: false,
    },
    {
      key: "chewiness",
      derived_from_model: textureModel.id,
      validated: false,
    },
  ],
};

export const MOCK_CANDIDATES: Record<string, Candidate[]> = {
  "mock-formulation-1": [
    {
      id: "mock-candidate-1",
      job_id: "mock-job-2",
      formulation_id: "mock-formulation-1",
      rank: 1,
      pareto: true,
      lines: [
        { ingredient_id: "mock-cowpea", percent: 45 },
        { ingredient_id: "mock-sorghum", percent: 30 },
        { ingredient_id: "mock-amaranth", percent: 25 },
      ],
      metrics: { protein_g: 17.4, hardness_n: 24.5, chewiness: 0.62 },
      predictions: TEXTURE_PREDICTIONS,
      model_ids: [optimizationModel.id, textureModel.id],
      scene: SCENE,
    },
    {
      id: "mock-candidate-2",
      job_id: "mock-job-2",
      formulation_id: "mock-formulation-1",
      rank: 2,
      pareto: true,
      lines: [
        { ingredient_id: "mock-cowpea", percent: 40 },
        { ingredient_id: "mock-sorghum", percent: 35 },
        { ingredient_id: "mock-amaranth", percent: 25 },
      ],
      metrics: { protein_g: 16.8, hardness_n: 22.1, chewiness: 0.58 },
      predictions: TEXTURE_PREDICTIONS,
      model_ids: [optimizationModel.id, textureModel.id],
      scene: SCENE,
    },
    {
      id: "mock-candidate-3",
      job_id: "mock-job-2",
      formulation_id: "mock-formulation-1",
      rank: 3,
      pareto: true,
      lines: [
        { ingredient_id: "mock-cowpea", percent: 50 },
        { ingredient_id: "mock-sorghum", percent: 25 },
        { ingredient_id: "mock-amaranth", percent: 25 },
      ],
      metrics: { protein_g: 18.2, hardness_n: 27.3, chewiness: 0.66 },
      predictions: TEXTURE_PREDICTIONS,
      model_ids: [optimizationModel.id, textureModel.id],
      scene: SCENE,
    },
  ],
};

/** Candidate detail payload: the candidate plus its latest results. */
export interface MockCandidateDetail extends Candidate {
  nutrition: NutritionResult | null;
  texture: TextureResult | null;
}

const MOCK_TEXTURE: TextureResult = {
  predictions: TEXTURE_PREDICTIONS,
  warnings: [
    { message: "Mock model: synthetic holdout only." },
    {
      message:
        "Interval is illustrative, not a calibrated prediction interval.",
    },
  ],
};

export const MOCK_CANDIDATE_DETAILS: Record<string, MockCandidateDetail> =
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
