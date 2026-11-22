import { expect } from "vitest";
import type { z } from "zod";
import { login } from "@/lib/api/auth";
import { getJob } from "@/lib/api/jobs";
import type { JobStatusResponse } from "@/types";

/**
 * Shared setup for the contract tests. These call the real backend; when none
 * is configured or reachable every suite skips, so `npm test` still runs
 * without the Compose stack.
 *
 *   E2E_API_URL     default http://localhost:8000
 *   E2E_EMAIL       a local-auth user, e.g. scientist@vpmf.local
 *   E2E_PASSWORD    that user's password
 *
 * The Vitest contract config mirrors these into `process.env` before any module
 * loads, because `lib/api/client.ts` reads `NEXT_PUBLIC_API_BASE_URL` once.
 */
export const API_URL = (
  process.env.E2E_API_URL ?? "http://localhost:8000"
).replace(/\/+$/, "");
export const EMAIL = process.env.E2E_EMAIL ?? "";
export const PASSWORD = process.env.E2E_PASSWORD ?? "";
/** Admin credentials, needed only for the admin-only endpoints. */
export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";

async function reachable(): Promise<boolean> {
  // The backend can be busy running a job started by another test file, so
  // retry rather than skipping the whole suite on one slow health check.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${API_URL}/api/health`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) return true;
    } catch {
      /* try again */
    }
  }
  return false;
}

export const contractAvailable =
  Boolean(EMAIL && PASSWORD) && (await reachable());

/** Why the suite skipped, for anyone reading a CI log. */
export function skipReason(): string {
  if (!EMAIL || !PASSWORD) return "E2E_EMAIL and E2E_PASSWORD are not set";
  return `no backend answered at ${API_URL}`;
}

export async function signIn(): Promise<void> {
  await login(EMAIL, PASSWORD);
}

/** Signs in as a different user, for the admin-only endpoints. */
export async function signInAs(email: string, password: string): Promise<void> {
  await login(email, password);
}

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

/** Polls a job until it reaches a terminal state. */
export async function waitForFinish(
  id: string,
  timeoutMs = 240_000,
): Promise<JobStatusResponse> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const job = await getJob(id);
    if (TERMINAL.has(job.status)) return job;
    if (Date.now() > deadline) {
      throw new Error(`job ${id} did not finish within ${timeoutMs} ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

/**
 * Asserts that a response really matches the schema the client claims for it.
 * The API client already validates, so a failure here means either the client
 * forgot to pass its schema or the schema itself has drifted.
 */
export function expectParses(
  schema: z.ZodType<unknown>,
  data: unknown,
  label: string,
): void {
  const result = schema.safeParse(data);
  const issues = result.success
    ? ""
    : result.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; ");
  expect(result.success, `${label} did not match its schema — ${issues}`).toBe(
    true,
  );
}
