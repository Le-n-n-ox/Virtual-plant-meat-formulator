import type { JobRecord, JobResult, JobType, Paginated } from "@/types";
import { buildQuery, requestValidated } from "./client";
import {
  jobRecordSchema,
  jobResultSchema,
  jobTypeSchema,
  paginatedSchema,
  startJobResponseSchema,
} from "@/lib/validation/schemas";

export type JobListParams = {
  status?: string;
  formulation_id?: string;
  type?: JobType;
  page?: number;
  page_size?: number;
};

export type StartJobParams = Record<string, unknown>;

export function startJob(
  formulationId: string,
  type: JobType,
  params?: StartJobParams,
): Promise<{ job_id: string }> {
  return requestValidated(
    `/api/formulations/${encodeURIComponent(formulationId)}/jobs`,
    startJobResponseSchema,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: jobTypeSchema.parse(type),
        params: params ?? {},
      }),
    },
  );
}

export function listJobs(
  params: JobListParams = {},
): Promise<Paginated<JobRecord>> {
  return requestValidated(
    `/api/jobs${buildQuery(params as Record<string, string | number | undefined>)}`,
    paginatedSchema(jobRecordSchema),
  );
}

export function getJob(jobId: string): Promise<JobRecord> {
  return requestValidated(
    `/api/jobs/${encodeURIComponent(jobId)}`,
    jobRecordSchema,
  );
}

export function cancelJob(jobId: string): Promise<JobRecord> {
  return requestValidated(
    `/api/jobs/${encodeURIComponent(jobId)}/cancel`,
    jobRecordSchema,
    { method: "POST" },
  );
}

export function getJobResult(jobId: string): Promise<JobResult> {
  return requestValidated(
    `/api/jobs/${encodeURIComponent(jobId)}/result`,
    jobResultSchema,
  );
}

/** EventSource URL for the live job stream. */
export function getJobEventsUrl(jobId: string): string {
  return `/api/jobs/${encodeURIComponent(jobId)}/events`;
}
