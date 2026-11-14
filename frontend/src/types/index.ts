export type JobType = "nutrition" | "texture_prediction" | "optimization";
export type JobStatus =
  "queued" | "running" | "completed" | "failed" | "cancelled";

export interface Ingredient {
  id: string;
  scientific_name: string | null;
  common_name: string;
  variety?: string | null;
  crop?: string | null;
  food_group?: string | null;
  moisture_percent?: number | null;
  quality_flag?: string;
  form:
    "raw" | "cooked" | "soaked" | "fermented" | "roasted" | "flour" | string;
  origin?: string;
  moisture_basis: string;
  nutrients: NutrientValue[];
  amino_acids: NutrientValue[];
  source: {
    id?: string;
    name: string;
    method?: string | null;
    date?: string | null;
    license_status: string;
    citation?: string | null;
    license_notes?: string | null;
    url?: string | null;
  };
}

export interface NutrientValue {
  key: string; // e.g. "protein", "lysine"
  name?: string; // display name, present on ingredient records
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
  description?: string | null;
  current_version?: number;
  note?: string | null;
  content_hash?: string;
  archived?: boolean;
  created_at?: string;
}

export interface ValidationResult {
  valid: boolean;
  total_percent: number;
  issues: ValidationIssue[];
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

export type ApiErrorCode =
  | "bad_request"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "version_conflict"
  | "cancel_not_supported"
  | "job_already_finished"
  | "job_limit_reached"
  | "payload_too_large"
  | "validation_failed"
  | "missing_ingredient_data"
  | "model_unavailable"
  | "infeasible"
  | "rate_limited"
  | "internal_error"
  | "dependency_unavailable"
  | "result_not_ready";

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface JobCreated {
  job_id: string;
  type: JobType | string;
  status: JobStatus;
  formulation_id: string;
  formulation_version: number;
  created_at: string;
}

export interface JobStatusResponse {
  id: string;
  type: JobType | string;
  status: JobStatus;
  stage: string | null;
  stage_label: string | null;
  progress_percent: number | null;
  message: string | null;
  cancel_requested: boolean;
  formulation_id: string;
  formulation_version: number;
  error: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  } | null;
  candidate_ids: string[];
  result_available: boolean;
  last_event_seq: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  data_versions: Record<string, string>;
  model_ids: string[];
  calc_version: string | null;
  seed: number | null;
}

export interface StreamToken {
  token: string;
  expires_at: string;
}

export interface IngredientListItem {
  id: string;
  common_name: string;
  scientific_name: string | null;
  variety?: string | null;
  crop?: string | null;
  form: string;
  moisture_basis: string;
  source: { id: string; name: string };
  quality_flag: "analytical" | "estimated" | string;
  protein_g_per_100g: number | null;
  has_amino_acids: boolean;
}

export interface IngredientDetail extends Ingredient {
  functional_properties?: {
    key: string;
    value: number | string | null;
    unit?: string;
  }[];
  price?: { value: number; currency: string; per: string } | null;
  dataset_version?: string;
}

export interface ValidationIssue {
  ingredient_id?: string;
  code: string;
  message: string;
}

export interface FormulationVersionSummary {
  version: number;
  created_at: string;
  created_by: string | null;
  note: string | null;
  content_hash: string;
}

export interface CandidateScene {
  visual_basis: "illustrative" | "calibrated" | string;
  variables: {
    key: string;
    derived_from_model: string | null;
    validated: boolean;
  }[];
}

export interface ResultWarning {
  code?: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface TexturePrediction extends Prediction {
  interval_level?: number;
  in_domain?: boolean;
  domain?: Record<string, unknown>;
  evidence_basis?: string;
  reason?: string;
  missing_features?: string[];
}

export interface Candidate {
  id: string;
  job_id: string;
  formulation_id: string;
  rank: number;
  pareto: boolean;
  lines: FormulationLine[];
  metrics: Record<string, unknown>;
  predictions: TexturePrediction[];
  model_ids: string[];
  scene: CandidateScene;
  warnings?: ResultWarning[];
  from_cancelled_job?: boolean;
  promoted_formulation_id?: string | null;
}

export interface CompareResponse {
  items: Candidate[];
  differences: {
    metric: string;
    unit: string | null;
    a: number | string | null;
    b: number | string | null;
    delta: number | null;
  }[];
}

export interface AminoAcidBlock {
  per_g_protein_mg: { key: string; value: number | null }[];
  reference_pattern: { id: string; name: string; version: string };
  scores: { key: string; score: number | null }[];
  limiting_amino_acid: string | null;
  score: number | null;
  method: string;
  complete: boolean;
  missing: string[];
}

export interface NutritionResult {
  basis: string;
  nutrients: NutrientValue[];
  amino_acids: AminoAcidBlock | null;
  calc_version: string;
  data_versions: Record<string, string>;
  job_id?: string;
  formulation_version?: number;
  finished_at?: string;
}

export interface TextureResult {
  predictions: TexturePrediction[];
  warnings: ResultWarning[];
  process?: Record<string, unknown>;
}

export interface ModelDetail extends ModelMeta {
  status: "approved" | "candidate" | "retired" | string;
  dataset_version?: string;
  approved_at?: string | null;
  unit?: string;
  interval_level?: number;
  limitations: string[] | string;
  feature_schema: Record<string, unknown>;
  applicability_domain: Record<string, unknown>;
  holdout_metrics: Record<string, number>;
  training_sources?: unknown[];
  is_test_model?: boolean;
}
