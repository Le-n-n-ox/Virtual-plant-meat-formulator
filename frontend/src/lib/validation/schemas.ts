import { z } from "zod";

/**
 * Zod mirrors of the backend contracts (frontend guide §6), reconciled with
 * `src/types/index.ts`. Every API client function validates its response
 * through these schemas, so a shape mismatch surfaces as an `ApiError` with the
 * code `contract_mismatch` instead of a silent `as` cast.
 *
 * Objects are deliberately not `.strict()`: an additive backend change must not
 * break the app, so unknown fields are stripped rather than rejected.
 */

const optionalString = z.string().optional();
const optionalNullableString = z.string().nullable().optional();
const recordNumber = z.record(z.string(), z.number());

export const nutrientValueSchema = z.object({
  key: z.string(),
  name: z.string().optional(),
  value: z.number().nullable(),
  unit: z.string(),
  flag: z.enum(["analytical", "estimated", "calculated"]),
  range: z.tuple([z.number(), z.number()]).optional(),
  reason: z.string().optional(),
  missing_ingredient_ids: z.array(z.string()).optional(),
  contains_estimated: z.boolean().optional(),
});

export const ingredientSourceSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  method: optionalNullableString,
  date: optionalNullableString,
  license_status: z.string(),
  citation: optionalNullableString,
  license_notes: optionalNullableString,
  url: optionalNullableString,
});

export const ingredientListItemSchema = z.object({
  id: z.string(),
  common_name: z.string(),
  scientific_name: z.string().nullable(),
  variety: z.string().nullable().optional(),
  crop: z.string().nullable().optional(),
  form: z.string(),
  moisture_basis: z.string(),
  source: z.object({ id: z.string(), name: z.string() }),
  quality_flag: z.string().optional(),
  protein_g_per_100g: z.number().nullable(),
  has_amino_acids: z.boolean(),
});

export const ingredientDetailSchema = z.object({
  id: z.string(),
  scientific_name: z.string().nullable(),
  common_name: z.string(),
  variety: z.string().nullable().optional(),
  crop: z.string().nullable().optional(),
  food_group: z.string().nullable().optional(),
  moisture_percent: z.number().nullable().optional(),
  quality_flag: z.string().optional(),
  form: z.string(),
  origin: z.string().optional(),
  moisture_basis: z.string(),
  nutrients: z.array(nutrientValueSchema),
  amino_acids: z.array(nutrientValueSchema),
  source: ingredientSourceSchema,
  functional_properties: z
    .array(
      z.object({
        key: z.string(),
        value: z.number().or(z.string()).nullable(),
        unit: z.string().optional(),
      }),
    )
    .optional(),
  price: z
    .object({ value: z.number(), currency: z.string(), per: z.string() })
    .nullable()
    .optional(),
  dataset_version: z.string().optional(),
});

export const facetEntrySchema = z.object({
  value: optionalString,
  id: optionalString,
  name: optionalString,
  count: z.number(),
});

export const ingredientFacetsSchema = z.object({
  crops: z.array(facetEntrySchema),
  forms: z.array(facetEntrySchema),
  sources: z.array(facetEntrySchema),
});

export const nutrientDefinitionSchema = z.object({
  key: z.string(),
  name: z.string(),
  unit: z.string(),
  kind: z.string(),
});

export const aminoAcidPatternSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string().optional(),
  is_default: z.boolean().optional(),
});

export const pagedSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    page_size: z.number().int().positive(),
  });

/** A list endpoint that answers either a bare array or a page. */
export const listOrPaged = <T extends z.ZodTypeAny>(item: T) =>
  z.union([z.array(item), pagedSchema(item)]);

// ---- Auth ----

export const loginResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number(),
});

export const currentUserSchema = z.object({
  user_id: z.string(),
  email: z.string(),
  display_name: z.string(),
  role: z.string(),
});

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
  targets: recordNumber.optional(),
  updated_at: z.string(),
  description: optionalNullableString,
  current_version: z.number().int().positive().optional(),
  note: optionalNullableString,
  content_hash: z.string().optional(),
  archived: z.boolean().optional(),
  created_at: z.string().optional(),
});

export const formulationListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  current_version: z.number().int().positive(),
  last_job: z
    .object({
      id: z.string(),
      type: z.string(),
      status: z.enum(["queued", "running", "completed", "failed", "cancelled"]),
      finished_at: z.string().nullable(),
    })
    .nullable(),
  updated_at: z.string(),
  archived: z.boolean().optional(),
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

export const formulationVersionSummarySchema = z.object({
  version: z.number().int().positive(),
  created_at: z.string(),
  created_by: z.string().nullable(),
  note: z.string().nullable(),
  content_hash: z.string(),
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

export const jobCreatedSchema = z.object({
  job_id: z.string(),
  type: z.string(),
  status: jobStatusSchema,
  formulation_id: z.string(),
  formulation_version: z.number().int().positive(),
  created_at: z.string(),
});

export const jobListItemSchema = z.object({
  id: z.string(),
  type: z.string(),
  formulation: z.object({
    id: z.string(),
    name: z.string(),
    version: z.number(),
  }),
  status: jobStatusSchema,
  stage_label: z.string().nullable(),
  created_at: z.string(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
});

export const jobStatusResponseSchema = z.object({
  id: z.string(),
  type: z.string(),
  status: jobStatusSchema,
  stage: z.string().nullable(),
  stage_label: z.string().nullable(),
  progress_percent: z.number().nullable(),
  message: z.string().nullable(),
  cancel_requested: z.boolean(),
  formulation_id: z.string(),
  formulation_version: z.number().int().positive(),
  error: z
    .object({
      code: z.string().optional(),
      message: z.string().optional(),
      details: z.record(z.string(), z.unknown()).optional(),
    })
    .nullable(),
  candidate_ids: z.array(z.string()),
  result_available: z.boolean(),
  last_event_seq: z.number().int(),
  created_at: z.string(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  data_versions: z.record(z.string(), z.string()),
  model_ids: z.array(z.string()),
  calc_version: z.string().nullable(),
  seed: z.number().int().nullable(),
});

export const streamTokenSchema = z.object({
  token: z.string(),
  expires_at: z.string(),
});

export const cancelResponseSchema = z.object({ accepted: z.boolean() });

// ---- Results ----

export const aminoAcidBlockSchema = z.object({
  per_g_protein_mg: z.array(
    z.object({ key: z.string(), value: z.number().nullable() }),
  ),
  reference_pattern: z.object({
    id: z.string(),
    name: z.string(),
    version: z.string(),
  }),
  scores: z.array(z.object({ key: z.string(), score: z.number().nullable() })),
  limiting_amino_acid: z.string().nullable(),
  score: z.number().nullable(),
  method: z.string(),
  complete: z.boolean(),
  missing: z.array(z.string()),
});

export const nutritionResultSchema = z.object({
  basis: z.string(),
  nutrients: z.array(nutrientValueSchema),
  amino_acids: aminoAcidBlockSchema.nullable(),
  calc_version: z.string(),
  data_versions: z.record(z.string(), z.string()),
  job_id: z.string().optional(),
  formulation_version: z.number().int().positive().optional(),
  finished_at: z.string().optional(),
});

export const modelMetaSchema = z.object({
  id: z.string(),
  target: z.string(),
  algorithm: z.string(),
  version: z.string(),
  training_set_size: z.number().int().nonnegative(),
  holdout_metric: z.object({ name: z.string(), value: z.number() }).optional(),
});

export const nearestEvidenceSchema = z.object({
  group: z.string(),
  distance: z.number().nullable().optional(),
  n_samples: z.number().int().optional(),
  measured_min: z.number().optional(),
  measured_max: z.number().optional(),
  unit: z.string().optional(),
  source: z.string().optional(),
});

export const texturePredictionSchema = z.object({
  target: z.string(),
  value: z.number().nullable(),
  unit: z.string(),
  interval: z.tuple([z.number(), z.number()]).optional(),
  model: modelMetaSchema,
  interval_level: z.number().optional(),
  in_domain: z.boolean().optional(),
  domain: z.record(z.string(), z.unknown()).optional(),
  evidence_basis: z.string().optional(),
  reason: z.string().optional(),
  missing_features: z.array(z.string()).optional(),
  nearest_evidence: z.array(nearestEvidenceSchema).optional(),
});

export const resultWarningSchema = z.object({
  code: z.string().optional(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const textureResultSchema = z.object({
  predictions: z.array(texturePredictionSchema),
  warnings: z.array(resultWarningSchema),
  process: z.record(z.string(), z.unknown()).optional(),
});

export const candidateSceneSchema = z.object({
  visual_basis: z.string(),
  variables: z.array(
    z.object({
      key: z.string(),
      derived_from_model: z.string().nullable(),
      validated: z.boolean(),
    }),
  ),
});

export const candidateSchema = z.object({
  id: z.string(),
  job_id: z.string(),
  formulation_id: z.string(),
  rank: z.number().int(),
  pareto: z.boolean(),
  lines: z.array(formulationLineSchema),
  metrics: z.record(z.string(), z.unknown()),
  predictions: z.array(texturePredictionSchema),
  model_ids: z.array(z.string()),
  scene: candidateSceneSchema,
  warnings: z.array(resultWarningSchema).optional(),
  from_cancelled_job: z.boolean().optional(),
  promoted_formulation_id: z.string().nullable().optional(),
});

export const compareResponseSchema = z.object({
  items: z.array(candidateSchema),
  differences: z.array(
    z.object({
      metric: z.string(),
      unit: z.string().nullable(),
      a: z.number().or(z.string()).nullable(),
      b: z.number().or(z.string()).nullable(),
      delta: z.number().nullable(),
    }),
  ),
});

// ---- Models ----

export const modelListItemSchema = z.object({
  id: z.string(),
  target: z.string(),
  algorithm: z.string(),
  version: z.string(),
  training_set_size: z.number().int().nonnegative(),
  holdout_metric: z
    .object({ name: z.string(), value: z.number() })
    .nullable()
    .optional(),
  status: z.string(),
  dataset_version: z.string(),
  approved_at: z.string().nullable(),
  unit: optionalString,
  interval_level: z.number().optional(),
});

export const modelDetailSchema = z.object({
  id: z.string(),
  target: z.string(),
  algorithm: z.string(),
  version: z.string(),
  training_set_size: z.number().int().nonnegative(),
  holdout_metric: z.object({ name: z.string(), value: z.number() }).optional(),
  status: z.string(),
  dataset_version: optionalString,
  approved_at: optionalNullableString,
  unit: optionalString,
  interval_level: z.number().optional(),
  limitations: z.union([z.array(z.string()), z.string()]),
  feature_schema: z.record(z.string(), z.unknown()),
  applicability_domain: z.record(z.string(), z.unknown()),
  holdout_metrics: recordNumber,
  training_sources: z.array(z.unknown()).optional(),
  is_test_model: z.boolean().optional(),
});

// ---- System ----

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  version: z.string(),
});

export const exportFormatSchema = z.enum(["pdf", "csv"]);
