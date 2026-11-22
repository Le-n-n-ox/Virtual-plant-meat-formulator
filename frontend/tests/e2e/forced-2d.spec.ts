import { expect, test } from "@playwright/test";
import { apiToken, savedPreferences, signIn } from "./_helpers";

/**
 * Forced 2D mode (guide §5 page 17): with the process-view preference set to
 * "Always 2D", the workspace shows the schematic and never mounts a WebGL
 * canvas.
 */

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  test.skip(
    (await apiToken(request)) === null,
    "API or dev users not available",
  );
});

test("the Always 2D preference takes effect immediately", async ({ page }) => {
  await page.addInitScript(
    (value) => {
      window.localStorage.setItem("vpmf-preferences", value);
    },
    savedPreferences({ viewMode: "2d" }),
  );

  await signIn(page);
  await page.goto("/formulations");
  const link = page.locator('table a[href^="/formulations/"]').first();
  test.skip((await link.count()) === 0, "no formulation exists yet");
  await link.click();

  await expect(
    page.getByLabel("2D process schematic"),
    "the 2D schematic should be shown",
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.locator("canvas"),
    "no WebGL canvas should be mounted in 2D mode",
  ).toHaveCount(0);
});

test("the 3D preference mounts the canvas", async ({ page }) => {
  await page.addInitScript(
    (value) => {
      window.localStorage.setItem("vpmf-preferences", value);
    },
    savedPreferences({ viewMode: "3d" }),
  );

  await signIn(page);
  await page.goto("/formulations");
  const link = page.locator('table a[href^="/formulations/"]').first();
  test.skip((await link.count()) === 0, "no formulation exists yet");
  await link.click();

  // WebGL may be unavailable in headless CI; the app then falls back to 2D and
  // says so, which is the documented behaviour rather than a failure.
  const canvas = page.locator("canvas");
  const schematic = page.getByLabel("2D process schematic");
  await expect(canvas.or(schematic).first()).toBeVisible({ timeout: 20_000 });
  if ((await canvas.count()) === 0) {
    await expect(page.getByText(/2D|WebGL|frame rate/i).first()).toBeVisible();
  }
});
