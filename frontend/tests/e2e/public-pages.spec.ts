import { expect, test } from "@playwright/test";

/**
 * Public pages (guide §5 page 17 and FE-3): a signed-out visitor must be able
 * to read /methodology without a redirect, and no link on the landing page may
 * lead to an error.
 */

test("signed-out visitors can read /methodology without a redirect", async ({
  page,
}) => {
  await page.goto("/methodology");
  await expect(page).toHaveURL(/\/methodology/);
  await expect(page.getByRole("heading").first()).toBeVisible();
  // The page says what it can show without a sign-in rather than failing.
  await expect(page.getByText(/approved models/i).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toHaveCount(0);
});

test("signed-out workspace links go to sign-in, not an error", async ({
  page,
}) => {
  for (const path of ["/dashboard", "/formulations", "/ingredients", "/jobs"]) {
    await page.goto(path);
    await page.waitForURL(/\/login/);
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/application error/i);
  }
});

test("every landing-page link resolves", async ({ page }) => {
  await page.goto("/");
  const hrefs = await page
    .locator("a[href]")
    .evaluateAll((nodes) =>
      nodes.map((n) => (n.getAttribute("href") ?? "").trim()),
    );

  const internal = [...new Set(hrefs)].filter((h) => h.startsWith("/"));
  expect(internal.length).toBeGreaterThan(3);

  const anchors = [...new Set(hrefs)].filter((h) => h.startsWith("#"));
  for (const hash of anchors) {
    const id = hash.slice(1);
    await expect(
      page.locator(`[id="${id}"]`),
      `landing page is missing the anchor ${hash}`,
    ).toHaveCount(1);
  }

  for (const path of internal) {
    await page.goto(path);
    await expect(page.locator("body")).toBeVisible();
    // Guarded pages redirect to sign-in; that is a successful navigation.
    expect(page.url(), `${path} did not navigate`).toContain(
      path === "/" ? "localhost" : path,
    );
    await expect(page.locator("body")).not.toContainText(/application error/i);
  }
});
