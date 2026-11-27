import { jsonInit, requestJson } from "./client";
import {
  assistantExplanationSchema,
  assistantStatusSchema,
} from "@/lib/validation/schemas";
import type { AssistantExplanation, AssistantStatus } from "@/types";

type ExplainBody = { question?: string };

export type { AssistantExplanation, AssistantStatus };

export function getAssistantStatus(): Promise<AssistantStatus> {
  return requestJson("/api/assistant/status", undefined, assistantStatusSchema);
}

export function explainJob(
  jobId: string,
  body: ExplainBody = {},
): Promise<AssistantExplanation> {
  return requestJson(
    `/api/jobs/${encodeURIComponent(jobId)}/explain`,
    jsonInit("POST", body),
    assistantExplanationSchema,
  );
}

export function explainCandidate(
  id: string,
  body: ExplainBody = {},
): Promise<AssistantExplanation> {
  return requestJson(
    `/api/candidates/${encodeURIComponent(id)}/explain`,
    jsonInit("POST", body),
    assistantExplanationSchema,
  );
}

export function explainModel(
  id: string,
  body: ExplainBody = {},
): Promise<AssistantExplanation> {
  return requestJson(
    `/api/models/${encodeURIComponent(id)}/explain`,
    jsonInit("POST", body),
    assistantExplanationSchema,
  );
}

export const assistantApi = {
  getAssistantStatus,
  explainJob,
  explainCandidate,
  explainModel,
};
export type AssistantApi = typeof assistantApi;
