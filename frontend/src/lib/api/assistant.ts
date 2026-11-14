import { jsonInit, requestJson } from "./client";

export interface AssistantStatus {
  configured: boolean;
  model: string | null;
  role: "explanation_only";
}

export interface AssistantExplanation {
  text: string;
  model: string;
  generated_at: string;
  disclaimer: string;
  numbers_check: { unverified_numbers: string[]; passed: boolean };
}

type ExplainBody = { question?: string };

export function getAssistantStatus(): Promise<AssistantStatus> {
  return requestJson("/api/assistant/status");
}

export function explainJob(
  jobId: string,
  body: ExplainBody = {},
): Promise<AssistantExplanation> {
  return requestJson(
    `/api/jobs/${encodeURIComponent(jobId)}/explain`,
    jsonInit("POST", body),
  );
}

export function explainCandidate(
  id: string,
  body: ExplainBody = {},
): Promise<AssistantExplanation> {
  return requestJson(
    `/api/candidates/${encodeURIComponent(id)}/explain`,
    jsonInit("POST", body),
  );
}

export function explainModel(
  id: string,
  body: ExplainBody = {},
): Promise<AssistantExplanation> {
  return requestJson(
    `/api/models/${encodeURIComponent(id)}/explain`,
    jsonInit("POST", body),
  );
}

export const assistantApi = {
  getAssistantStatus,
  explainJob,
  explainCandidate,
  explainModel,
};
export type AssistantApi = typeof assistantApi;
