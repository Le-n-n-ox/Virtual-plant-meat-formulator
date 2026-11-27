import { z } from "zod";
import {
  aminoAcidBlockSchema,
  aminoAcidPatternSchema,
  assistantExplanationSchema,
  assistantStatusSchema,
  candidateSceneSchema,
  candidateSchema,
  compareResponseSchema,
  currentUserSchema,
  exportFormatSchema,
  facetEntrySchema,
  formulationLineSchema,
  formulationListItemSchema,
  formulationSchema,
  formulationVersionSummarySchema,
  healthResponseSchema,
  ingredientDetailSchema,
  ingredientFacetsSchema,
  ingredientListItemSchema,
  ingredientSourceSchema,
  jobCreatedSchema,
  jobEventNameSchema,
  jobEventSchema,
  jobListItemSchema,
  jobStatusResponseSchema,
  jobStatusSchema,
  jobTypeSchema,
  loginResponseSchema,
  modelDetailSchema,
  modelListItemSchema,
  modelMetaSchema,
  nearestEvidenceSchema,
  nutrientDefinitionSchema,
  nutrientValueSchema,
  nutritionResultSchema,
  pagedMetaSchema,
  resultWarningSchema,
  streamTokenSchema,
  texturePredictionSchema,
  textureResultSchema,
  validationResultSchema,
} from "@/lib/validation/schemas";

/**
 * The backend contract is written once, as Zod schemas in
 * `lib/validation/schemas.ts`. Every response type below is derived from those
 * schemas with `z.infer`, so the validated runtime value and the compile-time
 * type cannot drift apart. Do not hand-write a response type here — change the
 * schema instead.
 *
 * A few types have no schema because they describe requests or local UI state
 * rather than a response; they are marked below.
 */

// ---- Shared ----

export type JobType = z.infer<typeof jobTypeSchema>;
export type JobStatus = z.infer<typeof jobStatusSchema>;
export type JobEventName = z.infer<typeof jobEventNameSchema>;
export type JobEvent = z.infer<typeof jobEventSchema>;

export type NutrientValue = z.infer<typeof nutrientValueSchema>;
export type IngredientSource = z.infer<typeof ingredientSourceSchema>;

/** The TypeScript face of `pagedSchema`; `items` is the generic part. */
export type Paged<T> = z.infer<typeof pagedMetaSchema> & { items: T[] };

// ---- Ingredients ----

export type IngredientListItem = z.infer<typeof ingredientListItemSchema>;
export type IngredientDetail = z.infer<typeof ingredientDetailSchema>;
/** The full ingredient record. `IngredientDetail` is the same contract. */
export type Ingredient = IngredientDetail;
export type FacetEntry = z.infer<typeof facetEntrySchema>;
export type IngredientFacets = z.infer<typeof ingredientFacetsSchema>;
export type NutrientDefinition = z.infer<typeof nutrientDefinitionSchema>;
export type AminoAcidPattern = z.infer<typeof aminoAcidPatternSchema>;

// ---- Formulations ----

export type FormulationLine = z.infer<typeof formulationLineSchema>;
export type Formulation = z.infer<typeof formulationSchema>;
export type FormulationListItem = z.infer<typeof formulationListItemSchema>;
export type ValidationResult = z.infer<typeof validationResultSchema>;
export type ValidationIssue = ValidationResult["issues"][number];
export type FormulationVersionSummary = z.infer<
  typeof formulationVersionSummarySchema
>;

// ---- Jobs ----

export type JobCreated = z.infer<typeof jobCreatedSchema>;
export type JobListItem = z.infer<typeof jobListItemSchema>;
export type JobStatusResponse = z.infer<typeof jobStatusResponseSchema>;
export type StreamToken = z.infer<typeof streamTokenSchema>;

// ---- Auth ----

export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type CurrentUser = z.infer<typeof currentUserSchema>;

// ---- Results ----

export type AminoAcidBlock = z.infer<typeof aminoAcidBlockSchema>;
export type NutritionResult = z.infer<typeof nutritionResultSchema>;
export type TextureResult = z.infer<typeof textureResultSchema>;
export type TexturePrediction = z.infer<typeof texturePredictionSchema>;
export type NearestEvidence = z.infer<typeof nearestEvidenceSchema>;
export type ResultWarning = z.infer<typeof resultWarningSchema>;
export type ModelMeta = z.infer<typeof modelMetaSchema>;

// ---- Candidates ----

export type CandidateScene = z.infer<typeof candidateSceneSchema>;
export type Candidate = z.infer<typeof candidateSchema>;
export type CompareResponse = z.infer<typeof compareResponseSchema>;

// ---- Models ----

export type ModelListItem = z.infer<typeof modelListItemSchema>;
export type ModelDetail = z.infer<typeof modelDetailSchema>;

// ---- System ----

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ExportFormat = z.infer<typeof exportFormatSchema>;
export type AssistantStatus = z.infer<typeof assistantStatusSchema>;
export type AssistantExplanation = z.infer<typeof assistantExplanationSchema>;

// ---- No schema: requests and local UI state ----

/**
 * Error codes the backend puts in an `ApiError` body. There is no response
 * schema for them because the client builds this union from the documented
 * list, not from a parsed payload.
 */
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

/** A feature value outside the model's applicability domain. */
export interface DomainViolation {
  feature: string;
  value: number;
  min: number;
  max: number;
}
