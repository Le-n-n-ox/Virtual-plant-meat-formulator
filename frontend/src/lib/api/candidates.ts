import type { Candidate, CandidateDetail, Formulation } from "@/types";
import { requestValidated } from "./client";
import {
  candidateDetailSchema,
  candidateListSchema,
  formulationSchema,
} from "@/lib/validation/schemas";

export function getCandidates(formulationId: string): Promise<Candidate[]> {
  return requestValidated(
    `/api/formulations/${encodeURIComponent(formulationId)}/candidates`,
    candidateListSchema,
  );
}

export function getCandidate(candidateId: string): Promise<CandidateDetail> {
  return requestValidated(
    `/api/candidates/${encodeURIComponent(candidateId)}`,
    candidateDetailSchema,
  );
}

/** Turn a candidate into a saved formulation (new version). */
export function promoteCandidate(candidateId: string): Promise<Formulation> {
  return requestValidated(
    `/api/candidates/${encodeURIComponent(candidateId)}/promote`,
    formulationSchema,
    { method: "POST" },
  );
}
