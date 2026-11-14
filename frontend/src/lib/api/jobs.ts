import type {
  JobCreated,
  JobStatus,
  JobStatusResponse,
  JobType,
  Paged,
  StreamToken,
} from "@/types";
import { buildQuery, jsonInit, requestJson } from "./client";

export interface NutritionJobParams {
  amino_acid_pattern_id?: string;
}

export interface ProcessConditions {
  moisture_percent: number;
  temperature_profile_c?: { zone: number; temp: number }[];
  screw_speed_rpm?: number;
  feed_rate_kg_h?: number;
  cooling?: { type: string; temp_c?: number };
}

export interface TextureJobParams {
  process: ProcessConditions;
  targets?: string[];
}

export interface OptimizationObjective {
  target: string;
  direction: "maximize" | "minimize" | "target";
  value?: number;
  unit?: string;
}

export interface OptimizationConstraints {
  ingredient_bounds?: {
    ingredient_id: string;
    min_percent?: number;
    max_percent?: number;
  }[];
  excluded_ingredient_ids?: string[];
  nutrient_minimums?: { key: string; min: number; unit?: string }[];
  nutrient_maximums?: { key: string; max: number; unit?: string }[];
  cost_ceiling?: { value: number; currency: string; per: string };
}

export interface OptimizationParams {
  objectives: OptimizationObjective[];
  constraints?: OptimizationConstraints;
  process?: Partial<ProcessConditions>;
  n_candidates?: number;
  seed?: number;
  out_of_domain?: "warn" | "drop";
}

export type StartJobBody =
  | { type: "nutrition"; version?: number; params?: NutritionJobParams }
  | { type: "texture_prediction"; version?: number; params: TextureJobParams }
  | { type: "optimization"; version?: number; params: OptimizationParams };

export interface JobListItem {
  id: string;
  type: JobType | string;
  formulation: { id: string; name: string; version: number };
  status: JobStatus;
  stage_label: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
}

export interface TrainModelBody {
  target: string;
  seed?: number;
  dataset_version?: string;
}

const base = (id: string) => `/api/jobs/${encodeURIComponent(id)}`;

export function startJob(
  formulationId: string,
  body: StartJobBody,
  options: { idempotencyKey?: string } = {},
): Promise<JobCreated> {
  return requestJson(
    `/api/formulations/${encodeURIComponent(formulationId)}/jobs`,
    jsonInit(
      "POST",
      body,
      options.idempotencyKey
        ? { "Idempotency-Key": options.idempotencyKey }
        : undefined,
    ),
  );
}

export function listJobs(
  params: {
    status?: JobStatus[] | JobStatus;
    type?: JobType | string;
    formulation_id?: string;
    page?: number;
    page_size?: number;
  } = {},
): Promise<Paged<JobListItem>> {
  const { status, ...rest } = params;
  return requestJson(
    `/api/jobs${buildQuery({
      ...rest,
      status: Array.isArray(status) ? status.join(",") : status,
    })}`,
  );
}

export function getJob(id: string): Promise<JobStatusResponse> {
  return requestJson(base(id));
}

export function getStreamToken(id: string): Promise<StreamToken> {
  return requestJson(`${base(id)}/stream-token`, { method: "POST" });
}

export function getJobResult<T = unknown>(id: string): Promise<T> {
  return requestJson(`${base(id)}/result`);
}

export function cancelJob(id: string): Promise<{ accepted: boolean }> {
  return requestJson(`${base(id)}/cancel`, { method: "POST" });
}

export function trainModel(body: TrainModelBody): Promise<JobCreated> {
  return requestJson("/api/admin/models/train", jsonInit("POST", body));
}

export const jobsApi = {
  startJob,
  listJobs,
  getJob,
  getStreamToken,
  getJobResult,
  cancelJob,
  trainModel,
};
export type JobsApi = typeof jobsApi;
