import { z } from "zod";

/**
 * Zod mirrors of the backend contracts (frontend guide §6). Every API client
 * function validates its response through these schemas, so a shape mismatch
 * surfaces as an ApiError instead of a silent `as` cast.
 */

export const nutrientValueSchema = z.object({
  key: z.string(),
  value: z.number().nullable(),
  unit: z.string(),
  flag: z.enum(["analytical", "estimated", "calculated"]),
  range: z.tuple([z.number(), z.number()]).optional(),
  reason: z.string().optional(),
  missing_ingredient_ids: z.array(z.string()).optional(),
  contains_estimated: z.boolean().optional(),
});

export type NutrientValueSchema = z.infer<typeof nutrientValueSchema>;

const ingredientSourceSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  method: z.string().optional(),
  date: z.string().optional(),
  license_status: z.string(),
});

export const ingredientListItemSchema = z.object({
  id: z.string(),
  scientific_name: z.string(),
  common_name: z.string(),
  variety: z.string().optional(),
  form: z.string(),
  origin: z.string().optional(),
  moisture_basis: z.string(),
  source: z.object({ id: z.string().optional(), name: z.string() }),
  quality_flag: z.string().optional(),
  protein_g_per_100g: z.number().nullable(),
  has_amino_acids: z.boolean(),
});

export const ingredientDetailSchema = ingredientListItemSchema.extend({
  source: ingredientSourceSchema,
  nutrients: z.array(nutrientValueSchema),
  amino_acids: z.array(nutrientValueSchema),
});

export const paginatedSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    page_size: z.number().int().positive(),
  });

// ---- Auth ----

export const authUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().optional(),
  created_at: z.string(),
});

export const loginRequestSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

export const loginResponseSchema = z.object({
  user: authUserSchema,
  token: z.string().optional(),
  expires_at: z.string().optional(),
});

export const logoutResponseSchema = z.object({ ok: z.boolean() });

// ---- Formulations ----

export const formulationLineSchema = z.object({
  ingredient_id: z.string(),
  percent: z.number(),
});

export const formulationSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.number().int().nonnegative(),
  lines: z.array(formulationLineSchema),
  targets: z.record(z.string(), z.number()).optional(),
  updated_at: z.string(),
});

export const formulationListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.number().int().nonnegative(),
  status: z.enum(["draft", "active", "archived"]),
  updated_at: z.string(),
  last_job_id: z.string().nullable(),
  last_job_status: z
    .enum(["queued", "running", "completed", "failed", "cancelled"])
    .nullable(),
});

export const createFormulationInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  template: z.string().optional(),
});

export const updateFormulationInputSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  lines: z.array(formulationLineSchema),
  targets: z.record(z.string(), z.number()).optional(),
});

export const validationResultSchema = z.object({
  valid: z.boolean(),
  total_percent: z.number(),
  issues: z.array(
    z.object({
      ingredient_id: z.string().optional(),
      code: z.string(),
      message: z.string(),
    }),
  ),
});

export const formulationVersionSchema = z.object({
  version: z.number().int().positive(),
  author: z.string(),
  created_at: z.string(),
  note: z.string().optional(),
  lines: z.array(formulationLineSchema),
});

export const formulationVersionDiffSchema = z.object({
  from: z.number().int().positive(),
  to: z.number().int().positive(),
  added: z.array(formulationLineSchema),
  removed: z.array(formulationLineSchema),
  changed: z.array(
    z.object({
      ingredient_id: z.string(),
      from: z.number(),
      to: z.number(),
    }),
  ),
});

// ---- Jobs ----

export const jobTypeSchema = z.enum([
  "nutrition",
  "texture_prediction",
  "optimization",
]);

export const jobStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const jobEventNameSchema = z.enum([
  "stage.updated",
  "progress.updated",
  "warning.raised",
  "candidate.ready",
  "result.ready",
  "job.completed",
  "job.failed",
  "job.cancelled",
]);

export const jobEventSchema = z.object({
  job_id: z.string(),
  event: jobEventNameSchema,
  status: jobStatusSchema,
  stage: z.string(),
  stage_label: z.string(),
  progress_percent: z.number().nullable(),
  message: z.string().optional(),
  candidate_id: z.string().nullable(),
  timestamp: z.string(),
  seq: z.number().int().optional(),
  completed: z.number().int().optional(),
  total: z.number().int().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const jobRecordSchema = z.object({
  id: z.string(),
  type: jobTypeSchema,
  status: jobStatusSchema,
  formulation_id: z.string().nullable(),
  stage: z.string().nullable(),
  stage_label: z.string().nullable(),
  progress_percent: z.number().nullable(),
  message: z.string().nullable(),
  candidate_ids: z.array(z.string()),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
});

// ---- Results ----

export const nutritionResultSchema = z.object({
  formulation_id: z.string(),
  per_basis: z.string(),
  moisture_basis: z.string(),
  nutrients: z.array(nutrientValueSchema),
  amino_acids: z.array(nutrientValueSchema),
  limiting_amino_acid: z.string().nullable(),
  calculation_version: z.string(),
  generated_at: z.string(),
});

export const modelMetaSchema = z.object({
  id: z.string(),
  target: z.string(),
  algorithm: z.string(),
  version: z.string(),
  training_set_size: z.number().int().nonnegative(),
  holdout_metric: z
    .object({ name: z.string(), value: z.number() })
    .nullable()
    .optional(),
});

export const predictionSchema = z.object({
  target: z.string(),
  value: z.number(),
  unit: z.string(),
  interval: z.tuple([z.number(), z.number()]).optional(),
  model: modelMetaSchema,
});

export const texturePredictionResultSchema = z.object({
  formulation_id: z.string(),
  predictions: z.array(predictionSchema),
  limitations: z.array(z.string()),
  generated_at: z.string(),
});

// ---- Candidates ----

export const candidateSchema = z.object({
  id: z.string(),
  formulation_id: z.string(),
  name: z.string(),
  lines: z.array(formulationLineSchema),
  metrics: z.record(z.string(), z.number()),
  cost_per_kg: z.number().nullable(),
  model: modelMetaSchema,
  created_at: z.string(),
});

export const candidateDetailSchema = candidateSchema.extend({
  nutrition: nutritionResultSchema.nullable(),
  texture: texturePredictionResultSchema.nullable(),
});

export const compareResponseSchema = z.object({
  ids: z.tuple([z.string(), z.string()]),
  candidates: z.array(candidateDetailSchema),
  differences: z.record(
    z.string(),
    z.object({ a: z.number(), b: z.number(), delta: z.number() }),
  ),
  reference: z.string().nullable(),
});

// ---- Models ----

export const modelRecordSchema = z.object({
  id: z.string(),
  target: z.string(),
  algorithm: z.string(),
  version: z.string(),
  training_set_size: z.number().int().nonnegative(),
  holdout_metric: z.object({ name: z.string(), value: z.number() }).nullable(),
  dataset_version: z.string(),
  limitations: z.array(z.string()),
  created_at: z.string(),
});

// ---- System ----

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  version: z.string(),
});

export const exportFormatSchema = z.enum(["pdf", "csv"]);

// ---- Job results / misc responses ----

export const startJobResponseSchema = z.object({ job_id: z.string() });

export const jobResultSchema = z.object({
  job_id: z.string(),
  status: jobStatusSchema,
  result: z.union([
    nutritionResultSchema,
    texturePredictionResultSchema,
    z.array(candidateSchema),
    z.null(),
  ]),
});

export const versionListSchema = z.object({
  items: z.array(formulationVersionSchema),
  total: z.number().int().nonnegative(),
});

export const candidateListSchema = z.array(candidateSchema);
