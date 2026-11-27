import { expect, test } from "@playwright/test";
import { apiToken, created, signIn } from "./_helpers";

/**
 * optimize → candidates → compare (guide §5 pages 9 and 11). Runs a real
 * optimization, opens the candidates it produced, picks two and checks the
 * comparison view.
 */

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  test.skip(
    (await apiToken(request)) === null,
    "API or dev users not available",
  );
});

test.afterAll(async ({ request }) => {
  const token = await apiToken(request);
  if (!token) return;
  for (const id of created) {
    await request.patch(
      `${process.env.E2E_API_URL ?? "http://localhost:8000"}/api/formulations/${id}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        data: { archived: true },
      },
    );
  }
});

test("optimize, open the candidates and compare two of them", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/formulations");
  const link = page.locator('table a[href^="/formulations/"]').first();
  test.skip((await link.count()) === 0, "no formulation exists yet");
  await link.click();
  await page.waitForURL(/\/formulations\/frm_/);
  const id = page.url().split("/formulations/")[1].split("/")[0];
  created.push(id);

  await page.goto(`/formulations/${id}/optimize`);
  await page.getByRole("button", { name: /Run optimization/ }).click();

  // Candidates appear on the optimize tab once the job completes.
  const viewCandidates = page.getByRole("link", { name: /View candidates/ });
  await expect(viewCandidates).toBeVisible({ timeout: 180_000 });
  await viewCandidates.click();
  await page.waitForURL(/\/candidates/);

  const checkboxes = page.getByLabel(
    /^Select candidate rank \d+ for comparison/,
  );
  const count = Math.min(2, await checkboxes.count());
  test.skip(count < 2, "the optimization produced fewer than two candidates");
  await checkboxes.nth(0).check();
  await checkboxes.nth(1).check();

  await page.getByRole("button", { name: /^Compare/ }).click();
  await page.waitForURL(/\/compare\?ids=/);
  await expect(page.locator("body")).not.toContainText(
    /choose two candidates/i,
  );
});
