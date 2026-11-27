// Drives the real formulation workspace and captures the drag-and-drop bench.
// Usage: node scripts/shoot-workspace.mjs <outDir>
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] ?? "/tmp/ws";
const BASE = process.env.BASE ?? "http://localhost:3100";
const API = process.env.API ?? "http://localhost:8000";
const EMAIL = "scientist@vpmf.local";
const PASSWORD = "devpassword123";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  // Headless Chromium has no GPU, so the scene would fall back to 2D without
  // a software GL implementation.
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
  ],
});
const page = await browser.newPage({
  viewport: { width: 1600, height: 950 },
  deviceScaleFactor: 1.5,
  reducedMotion: "no-preference",
});

// Force the 3D view: software GL would otherwise be judged a weak device and
// the scene would fall back to 2D.
await page.addInitScript(() => {
  localStorage.setItem(
    "vpmf-preferences",
    JSON.stringify({
      state: {
        viewMode: "3d",
        motion: "full",
        aminoAcidUnit: "mg",
        energyUnit: "kcal",
        proteinUnit: "g_per_100g",
      },
      version: 1,
    }),
  );
});
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(String(e)));

const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });

// --- a formulation to work in, created through the API ---
const api = await page.request.post(`${API}/api/auth/login`, {
  data: { email: EMAIL, password: PASSWORD },
});
const { access_token: token } = await api.json();
const made = await page.request.post(`${API}/api/formulations`, {
  headers: { Authorization: `Bearer ${token}` },
  data: { name: `Bench check ${Date.now()}`, description: "scene check" },
});
const formulation = await made.json();
console.log("formulation", formulation.id);

// --- sign in ---
await page.goto(`${BASE}/login`);
await page.fill("#email", EMAIL);
await page.fill("#password", PASSWORD);
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL(/dashboard|formulations/);

// --- the workspace, with the scene ---
await page.goto(`${BASE}/formulations/${formulation.id}`);
await page.waitForSelector("canvas", { timeout: 30000 });
await page.waitForTimeout(6000); // assets decode, camera settles
await shot("01-empty-bench");

const canvas = await page.locator("canvas").first().boundingBox();
console.log("canvas", JSON.stringify(canvas));

// The pantry panel is the HTML drag source; open it (it collapses in 3D).
const pantryToggle = page.getByRole("button", { name: /^Pantry/ });
if (await pantryToggle.count()) {
  await pantryToggle.first().click();
  await page.waitForTimeout(400);
}
await shot("02-pantry-open");

// --- drag a crop from the pantry list onto the vessel ---
const crop = page
  .locator("#drag-target-pantry button")
  .filter({ hasNot: page.locator("svg") })
  .first();
const cropBox = await crop.boundingBox();
console.log("crop", await crop.textContent(), JSON.stringify(cropBox));

// Vessel sits at the scene origin: a little left of the canvas centre.
const vessel = {
  x: canvas.x + canvas.width * 0.44,
  y: canvas.y + canvas.height * 0.56,
};

await page.mouse.move(
  cropBox.x + cropBox.width / 2,
  cropBox.y + cropBox.height / 2,
);
await page.mouse.down();
// Past the 6 px threshold, into the canvas.
await page.mouse.move(cropBox.x + 40, cropBox.y + 30, { steps: 5 });
await page.waitForTimeout(250);
await shot("03-carry-start");
await page.mouse.move(vessel.x - 160, vessel.y - 60, { steps: 12 });
await page.waitForTimeout(250);
await shot("04-carrying");
await page.mouse.move(vessel.x, vessel.y, { steps: 12 });
await page.waitForTimeout(350);
await shot("05-over-vessel");
await page.mouse.up();
await page.waitForTimeout(120);
await shot("06-just-dropped");
await page.waitForTimeout(1400);
await shot("07-after-drop");
await page.waitForTimeout(4000);
await shot("08-validated");
console.log("rows after drop:", await page.locator("table tbody tr").count());

// --- a cancelled drag: pick up a bin, release over empty bench ---
await page.mouse.move(vessel.x - 220, vessel.y + 40);
await page.mouse.down();
await page.mouse.move(vessel.x - 150, vessel.y - 80, { steps: 8 });
await page.waitForTimeout(200);
await shot("09-bin-carried");
await page.mouse.move(
  canvas.x + canvas.width * 0.8,
  canvas.y + canvas.height * 0.85,
  { steps: 10 },
);
await page.waitForTimeout(200);
await page.mouse.up();
await page.waitForTimeout(140);
await shot("10-cancel-arc");
await page.waitForTimeout(1200);
await shot("11-after-cancel");

// --- what the app says happened ---
const announcement = await page
  .locator('[aria-live="polite"]')
  .allTextContents();
console.log("announcements:", JSON.stringify(announcement.filter(Boolean)));
const rows = await page.locator("table tbody tr").count();
console.log("formulation rows:", rows);

if (errors.length > 0) {
  console.log("--- console errors ---");
  for (const e of [...new Set(errors)].slice(0, 15)) console.log(e);
} else {
  console.log("no console errors");
}
await browser.close();
