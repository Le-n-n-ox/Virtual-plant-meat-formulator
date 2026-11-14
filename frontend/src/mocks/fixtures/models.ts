import type { ModelRecord } from "@/types";

/** Mock model registry. No model here is trained or validated. */
export const MOCK_MODELS: ModelRecord[] = [
  {
    id: "mock-model-nutrition",
    target: "nutrition",
    algorithm: "weighted_mixture (mock)",
    version: "mock-v0.1",
    training_set_size: 0,
    holdout_metric: null,
    dataset_version: "mock-dataset-v0",
    limitations: [
      "Mock model: not trained on any dataset.",
      "Nutrition is a deterministic weighted mixture, not a prediction.",
    ],
    created_at: "2026-11-14T00:00:00Z",
  },
  {
    id: "mock-model-texture",
    target: "texture",
    algorithm: "elastic_net (mock)",
    version: "mock-v0.1",
    training_set_size: 12,
    holdout_metric: { name: "MAE", value: 0.42 },
    dataset_version: "mock-dataset-v0",
    limitations: [
      "Mock model: tiny synthetic holdout.",
      "Predictions carry no calibrated uncertainty.",
    ],
    created_at: "2026-11-14T00:00:00Z",
  },
  {
    id: "mock-model-optimization",
    target: "optimization",
    algorithm: "grid_search (mock)",
    version: "mock-v0.1",
    training_set_size: 0,
    holdout_metric: null,
    dataset_version: "mock-dataset-v0",
    limitations: ["Mock model: enumerates a synthetic candidate grid."],
    created_at: "2026-11-14T00:00:00Z",
  },
];

export const MOCK_MODELS_BY_ID: Record<string, ModelRecord> =
  Object.fromEntries(MOCK_MODELS.map((model) => [model.id, model]));
