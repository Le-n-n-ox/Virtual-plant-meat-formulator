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

export interface IngredientListItem {
  id: string;
  scientific_name: string;
  common_name: string;
  variety?: string;
  form: string;
  origin?: string;
  moisture_basis: string;
  source: {
    id?: string;
    name: string;
  };
  quality_flag?: string;
  protein_g_per_100g: number | null;
  has_amino_acids: boolean;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
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
  holdout_metric?: { name: string; value: number } | null;
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

// ---- Auth ----

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  created_at: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: AuthUser;
  token?: string;
  expires_at?: string;
}

export interface LogoutResponse {
  ok: boolean;
}

// ---- Formulations ----

export interface FormulationListItem {
  id: string;
  name: string;
  version: number;
  status: "draft" | "active" | "archived";
  updated_at: string;
  last_job_id: string | null;
  last_job_status: JobStatus | null;
}

export interface CreateFormulationInput {
  name: string;
  description?: string;
  template?: string;
}

export interface UpdateFormulationInput {
  name?: string;
  description?: string;
  lines: FormulationLine[];
  targets?: Record<string, number>;
}

export interface FormulationVersion {
  version: number;
  author: string;
  created_at: string;
  note?: string;
  lines: FormulationLine[];
}

export interface FormulationVersionDiff {
  from: number;
  to: number;
  added: FormulationLine[];
  removed: FormulationLine[];
  changed: { ingredient_id: string; from: number; to: number }[];
}

// ---- Jobs ----

export interface JobRecord {
  id: string;
  type: JobType;
  status: JobStatus;
  formulation_id: string | null;
  stage: string | null;
  stage_label: string | null;
  progress_percent: number | null;
  message: string | null;
  candidate_ids: string[];
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
}

// ---- Results ----

export interface NutritionResult {
  formulation_id: string;
  per_basis: string;
  moisture_basis: string;
  nutrients: NutrientValue[];
  amino_acids: NutrientValue[];
  limiting_amino_acid: string | null;
  calculation_version: string;
  generated_at: string;
}

export interface TexturePredictionResult {
  formulation_id: string;
  predictions: Prediction[];
  limitations: string[];
  generated_at: string;
}

// ---- Candidates ----

export interface Candidate {
  id: string;
  formulation_id: string;
  name: string;
  lines: FormulationLine[];
  metrics: Record<string, number>;
  cost_per_kg: number | null;
  model: ModelMeta;
  created_at: string;
}

export interface CandidateDetail extends Candidate {
  nutrition: NutritionResult | null;
  texture: TexturePredictionResult | null;
}

export interface CompareResponse {
  ids: [string, string];
  candidates: CandidateDetail[];
  differences: Record<string, { a: number; b: number; delta: number }>;
  reference: string | null;
}

// ---- Models ----

export interface ModelRecord {
  id: string;
  target: string;
  algorithm: string;
  version: string;
  training_set_size: number;
  holdout_metric: { name: string; value: number } | null;
  dataset_version: string;
  limitations: string[];
  created_at: string;
}

// ---- Exports ----

export type ExportFormat = "pdf" | "csv";

export interface JobResult {
  job_id: string;
  status: JobStatus;
  result: NutritionResult | TexturePredictionResult | Candidate[] | null;
}
