import { expect, test } from "@playwright/test";
import { apiToken, signIn } from "./_helpers";

/**
 * Export download (guide §5 page 13). The report tab downloads a real file from
 * `GET /api/formulations/{id}/export`; this asserts the browser actually receives
 * a download with the expected name and a non-empty body.
 */

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  test.skip(
    (await apiToken(request)) === null,
    "API or dev users not available",
  );
});

test("the report downloads a CSV export", async ({ page }) => {
  await signIn(page);
  await page.goto("/formulations");
  const link = page.locator('table a[href^="/formulations/"]').first();
  test.skip((await link.count()) === 0, "no formulation exists yet");
  await link.click();
  await page.waitForURL(/\/formulations\/frm_/);
  const id = page.url().split("/formulations/")[1].split("/")[0];

  await page.goto(`/formulations/${id}/report`);
  const download = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByRole("button", { name: "Download CSV" }).click();
  const file = await download;

  expect(file.suggestedFilename()).toMatch(/\.csv$/);
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks).toString("utf-8");
  expect(body.length).toBeGreaterThan(0);
  expect(body).toContain(id);
});

test("the report downloads a PDF export", async ({ page }) => {
  await signIn(page);
  await page.goto("/formulations");
  const link = page.locator('table a[href^="/formulations/"]').first();
  test.skip((await link.count()) === 0, "no formulation exists yet");
  await link.click();
  await page.waitForURL(/\/formulations\/frm_/);
  const id = page.url().split("/formulations/")[1].split("/")[0];

  await page.goto(`/formulations/${id}/report`);
  const download = page.waitForEvent("download", { timeout: 120_000 });
  await page.getByRole("button", { name: "Download PDF" }).click();
  const file = await download;

  expect(file.suggestedFilename()).toMatch(/\.pdf$/);
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  expect(Buffer.concat(chunks).length).toBeGreaterThan(0);
});
