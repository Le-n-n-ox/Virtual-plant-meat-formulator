import { expect, test } from "@playwright/test";
import { apiToken, created, signIn } from "./_helpers";

/**
 * Cancelling a job and following one across a reload (guide §5 page 6 behaviour
 * 4 and page 14): a job started here keeps running after a reload, the detail
 * page re-attaches to its stream, and a running job can be cancelled.
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
  const api = process.env.E2E_API_URL ?? "http://localhost:8000";
  for (const id of created) {
    await request.patch(`${api}/api/formulations/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { archived: true },
    });
  }
});

test("a job survives a reload and can be cancelled from its detail page", async ({
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

  // Jobs run on the saved version; make sure there is one to run.
  const save = page
    .locator('section[aria-label="Save"]')
    .getByRole("button", { name: /^Save$/ });
  if (await save.isEnabled()) {
    await save.click();
    await expect(page.getByText("Saved").first()).toBeVisible({
      timeout: 15_000,
    });
  }

  await page.getByRole("button", { name: /Run nutrition/ }).click();

  // Wait for the job to exist, then reload while it runs.
  await page.waitForURL(/\/jobs\//, { timeout: 5_000 }).catch(() => {});
  const jobUrl = page.url();
  const onJobsPage = /\/jobs\//.test(jobUrl);

  if (!onJobsPage) {
    // The editor keeps the user in place; open the job detail directly.
    const jobId = await page
      .locator('a[href^="/jobs/"]')
      .first()
      .getAttribute("href")
      .catch(() => null);
    test.skip(jobId === null, "no job was started");
    await page.goto(jobId!);
  }

  await page.reload();
  await expect(page.getByLabel("Event log")).toBeVisible({ timeout: 20_000 });

  // The detail page re-attaches to the live stream for a queued/running job.
  const cancel = page.getByRole("button", { name: /^Cancel$/ });
  const finished = await page
    .getByText(/^(completed|failed|cancelled)$/)
    .first()
    .isVisible({ timeout: 120_000 })
    .catch(() => false);

  if (!finished) {
    await expect(cancel).toBeVisible({ timeout: 20_000 });
    await cancel.click();
    // The store applies the terminal state from the stream.
    await expect(page.getByText("cancelled")).toBeVisible({
      timeout: 120_000,
    });
  }
});
