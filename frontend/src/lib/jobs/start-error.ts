import { ApiError } from "@/lib/api/client";
import { describeRunError } from "@/lib/jobs/job-runner";

export interface ErrorIssue {
  message: string;
  field?: string | null;
  code?: string;
}

export interface StartErrorInfo {
  code: string;
  message: string;
  issues: ErrorIssue[];
  violated: string[];
}

function asIssues(raw: unknown): ErrorIssue[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (typeof item === "string") return [{ message: item }];
    if (item && typeof item === "object" && "message" in item) {
      const o = item as ErrorIssue;
      return [{ message: String(o.message), field: o.field, code: o.code }];
    }
    return [];
  });
}

function asViolated(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => {
    if (typeof v === "string") return v;
    if (v && typeof v === "object") {
      const o = v as { description?: string; constraint?: string };
      return o.description ?? o.constraint ?? JSON.stringify(v);
    }
    return String(v);
  });
}

/** Turns an API error (from starting a job) into display text. */
export function describeStartError(error: unknown): StartErrorInfo {
  if (error instanceof ApiError) {
    return {
      code: error.code,
      message: describeRunError(error.code, error.message),
      issues: asIssues(error.details.issues),
      violated: asViolated(error.details.violated_constraints),
    };
  }
  return {
    code: "request_failed",
    message:
      error instanceof Error ? error.message : "Could not start the job.",
    issues: [],
    violated: [],
  };
}

/** Same shape, from a stored job error ({code, message, details}). */
export function describeJobError(
  error: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  } | null,
): StartErrorInfo | null {
  if (!error) return null;
  const code = error.code ?? "job_failed";
  return {
    code,
    message: describeRunError(code, error.message ?? "The job failed."),
    issues: asIssues(error.details?.issues),
    violated: asViolated(error.details?.violated_constraints),
  };
}
