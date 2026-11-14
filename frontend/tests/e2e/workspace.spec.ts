import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

/**
 * End-to-end flow against the real stack (frontend + API + seeded catalogue):
 * sign in, build a formulation from catalogue ingredients, validate, save, run nutrition,
 * and check that an out-of-range blend gets no texture number.
 *
 * Needs `docker compose up` with the dev users seeded. Skipped when the API is not reachable.
 * Formulations created here are archived afterwards.
 */
const API = process.env.E2E_API_URL ?? "http://localhost:8000";
const EMAIL = process.env.E2E_EMAIL ?? "scientist@vpmf.local";
const PASSWORD = process.env.E2E_PASSWORD ?? "devpassword123";
const created: string[] = [];

async function apiToken(request: APIRequestContext): Promise<string | null> {
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

async function signIn(page: Page) {
  await page.goto("/login");
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/dashboard|formulations/);
}

async function addIngredient(page: Page, query: string) {
  await page.getByLabel("Search ingredients").fill(query);
  const add = page.getByRole("button", { name: /^Add / }).first();
  await expect(add).toBeVisible({ timeout: 15_000 });
  await add.click();
}

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
    await request.patch(`${API}/api/formulations/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { archived: true },
    });
  }
});

test("signed-out visitors are sent to the login page", async ({ page }) => {
  await page.goto("/formulations");
  await page.waitForURL(/\/login/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("build, validate, save and calculate nutrition for a real blend", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/formulations");
  await page
    .getByRole("button", { name: /New formulation/ })
    .first()
    .click();
  await page.fill("#new-name", "e2e kidney bean and sorghum");
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForURL(/\/formulations\/frm_/);
  const id = page.url().split("/formulations/")[1].split("/")[0];
  created.push(id);

  await addIngredient(page, "Beans, kidney, dry, raw");
  await addIngredient(page, "Sorghum, grain, white, dry, raw");

  const percents = page.getByLabel(/^Percentage of /);
  await percents.nth(0).fill("50");
  await percents.nth(1).fill("40");
  const save = page
    .locator('section[aria-label="Save"]')
    .getByRole("button", { name: /Save/ });
  await expect(save).toBeDisabled(); // 90% is invalid, so it cannot be saved

  await percents.nth(1).fill("50");
  await expect(page.getByText(/Total 100%/)).toBeVisible();
  await expect(save).toBeEnabled({ timeout: 10_000 });
  await save.click();
  await expect(page.getByText("Saved").first()).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: /Run nutrition/ }).click();
  const nutrition = page.locator('[aria-label="Nutrition results"]');
  await expect(nutrition).toBeVisible({ timeout: 60_000 });
  await expect(nutrition).toContainText("Protein");
  await expect(nutrition).toContainText("kcal"); // energy is reported, not missing
  await expect(nutrition).toContainText("AAS");
  await expect(nutrition).not.toContainText("DIAAS");
});

test("an out-of-range blend gets no texture number", async ({ page }) => {
  test.skip(
    created.length === 0,
    "needs the formulation from the previous test",
  );
  await signIn(page);
  await page.goto(`/formulations/${created[0]}/texture`);
  const form = page.locator('[aria-label="Predict texture"]').first();
  await expect(form).toBeVisible({ timeout: 20_000 });
  await form.locator('input[type="number"]').first().fill("60");
  await form.getByRole("button", { name: /Predict texture/ }).click();

  const outcome = page
    .locator('[aria-label="Texture prediction"]')
    .or(page.getByText(/No approved texture model/i));
  await expect(outcome.first()).toBeVisible({ timeout: 60_000 });
  const panel = page.locator('[aria-label="Texture prediction"]');
  if (await panel.count()) {
    // Whole-food flours are outside the models' training range: evidence, not a value.
    await expect(panel).toContainText("Insufficient supporting evidence");
    await expect(panel).toContainText("Nearest published samples");
    await expect(panel).not.toContainText("% interval");
  }
});

test("the catalogue hides meat, fish and dairy by default", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/ingredients");
  const toggle = page.getByLabel("Hide meat, fish and dairy");
  await expect(toggle).toBeChecked();
  await page
    .getByPlaceholder(/search/i)
    .first()
    .fill("Nile perch");
  await expect(
    page
      .getByRole("table")
      .getByText(/Nile perch/)
      .first(),
  ).toBeHidden({
    timeout: 10_000,
  });
  await toggle.uncheck();
  await expect(
    page
      .getByRole("table")
      .getByText(/Nile perch/)
      .first(),
  ).toBeVisible({
    timeout: 10_000,
  });
});
