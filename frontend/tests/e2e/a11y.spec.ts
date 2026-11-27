import { expect, test } from "@playwright/test";
import { apiToken, expectNoSeriousViolations, signIn } from "./_helpers";

/**
 * Accessibility gate on each main page (guide §5 page 17). Public pages are
 * always checked; workspace pages need the seeded dev users, so they are
 * skipped when the API is unreachable, like the rest of the e2e suite.
 */

const PUBLIC_PAGES = ["/", "/methodology", "/login"];
const WORKSPACE_PAGES = [
  "/dashboard",
  "/ingredients",
  "/formulations",
  "/analytics",
  "/jobs",
  "/models",
  "/settings",
];

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  test.skip(
    (await apiToken(request)) === null,
    "API or dev users not available",
  );
});

for (const path of PUBLIC_PAGES) {
  test(`no serious accessibility violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("body")).toBeVisible();
    await expectNoSeriousViolations(page, path);
  });
}

for (const path of WORKSPACE_PAGES) {
  test(`no serious accessibility violations on ${path}`, async ({ page }) => {
    await signIn(page);
    await page.goto(path);
    await expect(page.locator("body")).toBeVisible();
    await expectNoSeriousViolations(page, path);
  });
}

test("no serious accessibility violations on a formulation editor", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/formulations");
  const link = page.locator('table a[href^="/formulations/"]').first();
  test.skip((await link.count()) === 0, "no formulation exists yet");
  await link.click();
  await expect(page.locator("body")).toBeVisible();
  await expectNoSeriousViolations(page, "/formulations/[id]");
});
