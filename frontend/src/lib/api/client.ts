import { z } from "zod";
import type { HealthResponse } from "@/types";
import { healthResponseSchema } from "@/lib/validation/schemas";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details: Record<string, unknown>,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ErrorEnvelope = {
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
    request_id?: string;
  };
};

export async function requestJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ErrorEnvelope;
    const error = body.error;
    throw new ApiError(
      error?.message ?? "The request failed.",
      response.status,
      error?.code ?? "request_failed",
      error?.details ?? {},
      error?.request_id ?? response.headers.get("X-Request-Id") ?? undefined,
    );
  }

  return (await response.json()) as T;
}

/**
 * Fetch and validate. A response that does not match the contract becomes an
 * ApiError (502 invalid_response) instead of a silently mistyped value.
 */
export async function requestValidated<S extends z.ZodTypeAny>(
  path: string,
  schema: S,
  init?: RequestInit,
): Promise<z.infer<S>> {
  const data = await requestJson<unknown>(path, init);
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new ApiError(
      "The server response did not match the expected shape.",
      502,
      "invalid_response",
      {
        path,
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    );
  }
  return parsed.data;
}

/** Serialize query params, dropping undefined and empty values. */
export function buildQuery(
  params: Record<string, string | number | boolean | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export function getHealth(): Promise<HealthResponse> {
  return requestValidated("/api/health", healthResponseSchema);
}
