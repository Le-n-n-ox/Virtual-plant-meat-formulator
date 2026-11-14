import type { Candidate, CompareResponse, Formulation, Paged } from "@/types";
import { buildQuery, jsonInit, requestJson } from "./client";

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
  );
}

export function getCandidate(id: string): Promise<Candidate> {
  return requestJson(`/api/candidates/${encodeURIComponent(id)}`);
}

export function promoteCandidate(
  id: string,
  body: { name?: string } = {},
): Promise<Formulation> {
  return requestJson(
    `/api/candidates/${encodeURIComponent(id)}/promote`,
    jsonInit("POST", body),
  );
}

export function compareCandidates(
  a: string,
  b: string,
): Promise<CompareResponse> {
  return requestJson(`/api/compare${buildQuery({ ids: [a, b] })}`);
}

export const candidatesApi = {
  listCandidates,
  getCandidate,
  promoteCandidate,
  compareCandidates,
};
export type CandidatesApi = typeof candidatesApi;
