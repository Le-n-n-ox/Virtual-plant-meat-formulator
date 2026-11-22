import AxeBuilder from "@axe-core/playwright";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const API = process.env.E2E_API_URL ?? "http://localhost:8000";
export const EMAIL = process.env.E2E_EMAIL ?? "scientist@vpmf.local";
export const PASSWORD = process.env.E2E_PASSWORD ?? "devpassword123";

/** Formulations created by a spec, archived again afterwards. */
export const created: string[] = [];

export async function apiToken(
  request: APIRequestContext,
): Promise<string | null> {
  try {
    const response = await request.post(`${API}/api/auth/login`, {
      data: { email: EMAIL, password: PASSWORD },
    });
    if (!response.ok()) return null;
    return ((await response.json()) as { access_token: string }).access_token;
  } catch {
    return null;
  }
}

export async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/dashboard|formulations/);
}

export async function archiveCreated(
  request: APIRequestContext,
): Promise<void> {
  const token = await apiToken(request);
  if (!token) return;
  for (const id of created) {
    await request.patch(`${API}/api/formulations/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { archived: true },
    });
  }
  created.length = 0;
}

/**
 * Accessibility gate (guide §5 page 17 hardening). Fails on serious or critical
 * violations; moderate and minor ones are reported but do not fail the run.
 */
export async function expectNoSeriousViolations(
  page: Page,
  label: string,
): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  const detail = blocking
    .map(
      (v) =>
        `${v.id} (${v.impact}) — ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
    )
    .join("\n");
  expect(
    blocking,
    `${label} has serious/critical violations:\n${detail}`,
  ).toEqual([]);
}

/** Seed localStorage before any app script runs. */
export function savedPreferences(patch: Record<string, unknown>): string {
  return JSON.stringify({
    state: {
      viewMode: "auto",
      motion: "system",
      aminoAcidUnit: "mg",
      energyUnit: "kcal",
      proteinUnit: "g_per_100g",
      ...patch,
    },
    version: 1,
  });
}
