import { chromium } from "@playwright/test";
const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("PAGEERROR", String(e).slice(0, 300)));
page.on("console", (m) => { if (["error","warning"].includes(m.type())) console.log("CONSOLE", m.type(), m.text().slice(0, 200)); });
const attr = () => page.evaluate(() => ({ dt: document.documentElement.getAttribute("data-theme"), cls: document.documentElement.className, ls: localStorage.getItem("theme"), bg: getComputedStyle(document.body).backgroundColor }));
for (const url of ["http://localhost:3000/", "http://localhost:3000/dashboard"]) {
  await page.goto(url); await page.waitForTimeout(4000);
  console.log(url, "initial", JSON.stringify(await attr()));
  const trigger = page.getByRole("button", { name: "Change colour theme" });
  console.log("trigger count", await trigger.count());
  await trigger.first().click(); await page.waitForTimeout(600);
  const items = page.getByRole("menuitemradio");
  console.log("radio items", await items.count());
  await page.getByRole("menuitemradio", { name: /Ember/ }).click(); await page.waitForTimeout(800);
  console.log(url, "after Ember", JSON.stringify(await attr()));
}
await page.goto("http://localhost:3000/settings"); await page.waitForTimeout(3000);
await page.getByRole("radio", { name: /Highland/ }).click(); await page.waitForTimeout(800);
console.log("settings after Highland", JSON.stringify(await attr()));
await browser.close();
