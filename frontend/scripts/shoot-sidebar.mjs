// Screenshots the workspace sidebar expanded and collapsed, to check the rail.
// Usage: node scripts/shoot-sidebar.mjs [baseUrl] [outDir]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3100";
const outDir = process.argv[3] ?? "/tmp/sidebar";
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
await page.fill("#email", "scientist@vpmf.local");
await page.fill("#password", "devpassword123");
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL(/dashboard|formulations/, { timeout: 30000 });
await page.waitForTimeout(2500);

const state = () =>
  page.getAttribute('[data-slot="sidebar"]', "data-state").catch(() => null);

console.log("state on load:", await state());
await page.screenshot({ path: `${outDir}/expanded.png` });

const trigger = page.getByRole("button", { name: /toggle navigation/i });
await trigger.click();
await page.waitForTimeout(900);
console.log("after toggle:", await state());
await page.screenshot({ path: `${outDir}/collapsed.png` });

// Hover a rail item so the tooltip is captured.
const links = page.locator('[data-slot="sidebar-menu-button"]');
await links.nth(2).hover();
await page.waitForTimeout(700);
await page.screenshot({ path: `${outDir}/collapsed-tooltip.png` });

// The cookie is what survives a reload.
const cookies = await page.context().cookies();
console.log(
  "sidebar_state cookie:",
  cookies.find((c) => c.name === "sidebar_state")?.value ?? "<none>",
);
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
console.log("state after reload:", await state());
await page.screenshot({ path: `${outDir}/after-reload.png` });

if (errors.length) {
  console.log("--- console errors ---");
  for (const e of [...new Set(errors)].slice(0, 10)) console.log(e);
} else {
  console.log("no console errors");
}
await browser.close();
