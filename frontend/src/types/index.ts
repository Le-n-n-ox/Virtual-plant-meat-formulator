export type JobType = "nutrition" | "texture_prediction" | "optimization";
export type JobStatus =
  "queued" | "running" | "completed" | "failed" | "cancelled";

export interface Ingredient {
  id: string;
  scientific_name: string;
  common_name: string;
  variety?: string;
  form:
    "raw" | "cooked" | "soaked" | "fermented" | "roasted" | "flour" | string;
  origin?: string;
  moisture_basis: string;
  nutrients: NutrientValue[];
  amino_acids: NutrientValue[];
  source: {
    name: string;
    method?: string;
    date?: string;
    license_status: string;
  };
}

export interface NutrientValue {
  key: string; // e.g. "protein", "lysine"
  value: number | null; // null = not reported, never 0
  unit: string;
  flag: "analytical" | "estimated" | "calculated"; // from backend guide §14
  range?: [number, number];
  reason?: string; // from backend guide §14
  missing_ingredient_ids?: string[]; // from backend guide §14
  contains_estimated?: boolean; // from backend guide §14
}

export interface FormulationLine {
  ingredient_id: string;
  percent: number; // percent of total mass
}

export interface Formulation {
  id: string;
  name: string;
  version: number;
  lines: FormulationLine[];
  targets?: Record<string, number>;
  updated_at: string;
}

export interface ValidationResult {
  valid: boolean;
  total_percent: number;
  issues: { ingredient_id?: string; code: string; message: string }[];
}

export interface JobEvent {
  job_id: string;
  event: JobEventName;
  status: JobStatus;
  stage: string; // e.g. "texture_prediction"
  stage_label: string; // e.g. "Predicting texture"
  progress_percent: number | null; // null = indeterminate; never faked
  message?: string;
  candidate_id: string | null;
  timestamp: string; // ISO 8601, UTC
  seq?: number; // from backend guide §14
  completed?: number; // from backend guide §14
  total?: number; // from backend guide §14
  details?: Record<string, unknown>; // from backend guide §14
}

export type JobEventName =
  | "stage.updated"
  | "progress.updated"
  | "warning.raised"
  | "candidate.ready"
  | "result.ready"
  | "job.completed"
  | "job.failed"
  | "job.cancelled";

export interface ModelMeta {
  id: string;
  target: string;
  algorithm: string;
  version: string;
  training_set_size: number;
  holdout_metric?: { name: string; value: number };
}

export interface Prediction {
  target: string; // e.g. "hardness"
  value: number;
  unit: string;
  interval?: [number, number]; // prediction interval, when available
  model: ModelMeta;
}

export interface HealthResponse {
  status: "ok";
  version: string;
}
