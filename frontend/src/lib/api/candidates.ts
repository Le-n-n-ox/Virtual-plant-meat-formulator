import type { Candidate, CompareResponse, Formulation, Paged } from "@/types";
import { buildQuery, jsonInit, requestJson } from "./client";
import {
  candidateSchema,
  compareResponseSchema,
  formulationSchema,
  pagedSchema,
} from "@/lib/validation/schemas";

export type { Candidate, CompareResponse } from "@/types";

export function listCandidates(
  formulationId: string,
  params: {
    job_id?: string;
    pareto?: boolean;
    page?: number;
    page_size?: number;
  } = {},
): Promise<Paged<Candidate>> {
  return requestJson(
    `/api/formulations/${encodeURIComponent(formulationId)}/candidates${buildQuery({ ...params })}`,
    undefined,
    pagedSchema(candidateSchema),
  );
}

export function getCandidate(id: string): Promise<Candidate> {
  return requestJson(
    `/api/candidates/${encodeURIComponent(id)}`,
    undefined,
    candidateSchema,
  );
}

export function promoteCandidate(
  id: string,
  body: { name?: string } = {},
): Promise<Formulation> {
  return requestJson(
    `/api/candidates/${encodeURIComponent(id)}/promote`,
    jsonInit("POST", body),
    formulationSchema,
  );
}

export function compareCandidates(
  a: string,
  b: string,
): Promise<CompareResponse> {
  return requestJson(
    `/api/compare${buildQuery({ ids: [a, b] })}`,
    undefined,
    compareResponseSchema,
  );
}

export const candidatesApi = {
  listCandidates,
  getCandidate,
  promoteCandidate,
  compareCandidates,
};
export type CandidatesApi = typeof candidatesApi;
