// Screenshots the scene lab's composed bench, for look development.
// Usage: node scripts/shoot-lab.mjs <outDir> [theme ...]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const [outDir = "/tmp/lab", ...themes] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const list = themes.length > 0 ? themes : ["light"];

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
  viewport: { width: 1280, height: 820 },
  deviceScaleFactor: 2,
});
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto("http://localhost:3000/dev-scene-lab", {
  waitUntil: "networkidle",
});

for (const theme of list) {
  const selects = page.locator("select");
  await selects
    .nth(1)
    .selectOption(theme)
    .catch(() => {});
  // Let the GLBs decode and the canvas settle.
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${outDir}/bench-${theme}.png` });
  console.log(`shot ${theme}`);
}

if (errors.length > 0) {
  console.log("--- console errors ---");
  for (const e of [...new Set(errors)].slice(0, 12)) console.log(e);
}
await browser.close();
