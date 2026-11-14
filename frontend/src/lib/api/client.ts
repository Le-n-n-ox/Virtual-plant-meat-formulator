import type { HealthResponse } from "@/types";
import { tokenStore } from "./token";

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

export type QueryValue =
  string | number | boolean | null | undefined | readonly (string | number)[];

/** Builds "?a=1&b=2"; skips null, undefined and empty values; joins arrays with commas. */
export function buildQuery(params?: Record<string, QueryValue>): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      search.set(key, value.join(","));
    } else {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export type JsonInit = Omit<RequestInit, "body"> & {
  /** Serialised as the JSON body with a Content-Type header. */
  json?: unknown;
  body?: BodyInit | null;
};

async function send(
  path: string,
  init: JsonInit | undefined,
  accept: string,
): Promise<Response> {
  const { json, ...rest } = init ?? {};
  const headers = new Headers(rest.headers);
  if (!headers.has("Accept")) headers.set("Accept", accept);
  const token = tokenStore.get();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  let body = rest.body;
  if (json !== undefined) {
    body = JSON.stringify(json);
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers,
    body,
  });

  if (!response.ok) {
    if (response.status === 401) tokenStore.clear();
    const parsed = (await response.json().catch(() => ({}))) as ErrorEnvelope;
    const error = parsed.error;
    throw new ApiError(
      error?.message ?? "The request failed.",
      response.status,
      error?.code ?? "request_failed",
      error?.details ?? {},
      error?.request_id ?? response.headers.get("X-Request-Id") ?? undefined,
    );
  }
  return response;
}

export async function requestJson<T>(
  path: string,
  init?: JsonInit,
): Promise<T> {
  const response = await send(path, init, "application/json");
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function jsonInit(
  method: string,
  json?: unknown,
  headers?: Record<string, string>,
): JsonInit {
  return { method, json, headers };
}

export async function requestBlob(
  path: string,
  init?: JsonInit,
): Promise<{ blob: Blob; filename: string | null }> {
  const response = await send(path, init, "*/*");
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  let filename: string | null = star?.[1] ?? plain?.[1] ?? null;
  if (filename && star) {
    try {
      filename = decodeURIComponent(filename);
    } catch {
      /* keep raw */
    }
  }
  return { blob: await response.blob(), filename };
}

export function getHealth(): Promise<HealthResponse> {
  return requestJson<HealthResponse>("/api/health");
}
