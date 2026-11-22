import { expect, test, type Page } from "@playwright/test";
import { apiToken, archiveCreated, created, signIn } from "./_helpers";
import {
  assertBaseline,
  recordFrames,
  saveFrameReport,
  type FrameStep,
} from "./_framings";

/**
 * The full journey from docs/demo-script.md, run unattended: sign in, create,
 * add ingredients, set proportions, save, calculate nutrition, predict texture,
 * optimize, compare two candidates and export.
 *
 * While a job runs the 3D scene animates, so frame timings are recorded for the
 * nutrition and optimization steps and written to
 * `frontend/test-results/demo-framings.json` for comparison against a baseline
 * device.
 */

const FRAME_MS = Number(process.env.DEMO_FRAME_MS ?? 5000);

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  test.skip(
    (await apiToken(request)) === null,
    "API or dev users not available",
  );
});

test.afterAll(async ({ request }) => {
  await archiveCreated(request);
});

async function addIngredient(page: Page, query: string) {
  await page.getByLabel("Search ingredients").fill(query);
  const add = page.getByRole("button", { name: /^Add / }).first();
  await expect(add).toBeVisible({ timeout: 20_000 });
  await add.click();
  await expect(add).toHaveText(/Added/);
}

test("the full journey, with frame timings on the 3D steps", async ({
  page,
}) => {
  const timings: FrameStep[] = [];

  // 1. Sign in.
  await signIn(page);

  // 2. Create a formulation.
  await page.goto("/formulations");
  await page
    .getByRole("button", { name: /New formulation/ })
    .first()
    .click();
  await page.fill("#new-name", "Demo blend");
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForURL(/\/formulations\/frm_/);
  const id = page.url().split("/formulations/")[1].split("/")[0];
  created.push(id);

  // 3. Add ingredients and set proportions.
  await addIngredient(page, "cowpea");
  await addIngredient(page, "sorghum");
  const percents = page.getByLabel(/^Percentage of /);
  await percents.nth(0).fill("60");
  await percents.nth(1).fill("40");
  await expect(page.getByText(/Total 100%/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Valid — scene updated/)).toBeVisible({
    timeout: 15_000,
  });

  // 4. Save.
  await page
    .locator('section[aria-label="Save"]')
    .getByRole("button", { name: /^Save$/ })
    .click();
  await expect(page.getByText("Saved").first()).toBeVisible({
    timeout: 20_000,
  });

  // 5. Calculate nutrition, measuring frames while the scene animates.
  await page.getByRole("button", { name: /Run nutrition/ }).click();
  timings.push(await recordFrames(page, "nutrition", FRAME_MS));
  const nutrition = page.locator('[aria-label="Nutrition results"]');
  await expect(nutrition).toBeVisible({ timeout: 180_000 });
  await expect(nutrition).toContainText("Protein");
  await expect(nutrition).toContainText("kcal");
  await expect(nutrition).toContainText("AAS");
  // The score must never be presented as DIAAS; the chart says so explicitly.
  await expect(nutrition).toContainText(/not DIAAS/i);

  // 6. Predict texture.
  await page.goto(`/formulations/${id}/texture`);
  const textureForm = page.locator('[aria-label="Predict texture"]').first();
  await expect(textureForm).toBeVisible({ timeout: 30_000 });
  await textureForm.locator('input[type="number"]').first().fill("60");
  await textureForm.getByRole("button", { name: /Predict texture/ }).click();
  const texture = page.locator('[aria-label="Texture prediction"]');
  const noModel = page.getByText(/No approved texture model/i);
  await expect(texture.or(noModel).first()).toBeVisible({ timeout: 180_000 });

  // 7. Optimize, measuring frames again.
  await page.goto(`/formulations/${id}/optimize`);
  await page.getByRole("button", { name: /Run optimization/ }).click();
  timings.push(await recordFrames(page, "optimize", FRAME_MS));
  const viewCandidates = page.getByRole("link", { name: /View candidates/ });
  await expect(viewCandidates).toBeVisible({ timeout: 240_000 });

  // 8. Compare two candidates.
  await viewCandidates.click();
  await page.waitForURL(/\/candidates/);
  const pick = page.getByLabel(/^Select candidate rank \d+ for comparison/);
  const available = await pick.count();
  if (available >= 2) {
    await pick.nth(0).check();
    await pick.nth(1).check();
    await page.getByRole("button", { name: /^Compare/ }).click();
    await page.waitForURL(/\/compare\?ids=/);
    await expect(page.locator("body")).not.toContainText(
      /choose two candidates/i,
    );
  } else {
    // The search may legitimately return one candidate; the rest of the
    // journey still runs so the demo script stays a complete walkthrough.
    console.log(`only ${available} candidate(s); skipping the comparison step`);
  }

  // 9. Export.
  await page.goto(`/formulations/${id}/report`);
  const download = page.waitForEvent("download", { timeout: 120_000 });
  await page.getByRole("button", { name: "Download CSV" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.csv$/);

  // 10. Frame timings against the baseline.
  const report = await saveFrameReport(timings);
  console.log(`frame timings written to ${report}`);
  for (const step of timings) assertBaseline(step);
});
