import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { THEMES, THEME_IDS } from "@/lib/themes";

const css = readFileSync(resolve(__dirname, "../src/app/globals.css"), "utf8");

/** All custom properties that apply to an element with data-theme=<id>. */
function tokensFor(id: string): Set<string> {
  const tokens = new Set<string>();
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const applies =
      selector.includes(`[data-theme="${id}"]`) ||
      (id === "light" && /(^|,)\s*:root\s*(,|$)/m.test(selector));
    if (!applies) continue;
    for (const [, name] of body.matchAll(/(--[\w-]+)\s*:/g)) tokens.add(name);
  }
  return tokens;
}

const REQUIRED = [
  "--background",
  "--foreground",
  "--card",
  "--popover",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--border",
  "--input",
  "--ring",
  "--destructive",
  "--success",
  "--warning",
  "--info",
  "--chart-1",
  "--chart-5",
  "--sidebar",
  "--scene-bg",
  "--scene-floor",
  "--scene-grid",
  "--scene-metal",
  "--scene-glass",
  "--scene-accent",
  "--scene-product",
  "--scene-active",
  "--scene-complete",
  "--scene-warning",
  "--scene-failed",
  "--scene-idle",
  "--scene-crop-1",
  "--scene-crop-6",
  "--scene-ambient",
  "--scene-key",
];

describe("theme tokens", () => {
  it("registers exactly six themes", () => {
    expect(THEMES).toHaveLength(6);
    expect(THEMES.map((t) => t.id)).toEqual([...THEME_IDS]);
  });

  const reference = tokensFor("light");

  it.each(THEME_IDS)("%s defines every required token", (id) => {
    const tokens = tokensFor(id);
    for (const token of REQUIRED)
      expect(tokens, `${id} is missing ${token}`).toContain(token);
  });

  it.each(THEME_IDS)("%s defines the same token set as the Lab theme", (id) => {
    expect([...reference].filter((t) => !tokensFor(id).has(t))).toEqual([]);
  });

  it("maps every dark theme into the dark: variant", () => {
    const variant = css.match(/@custom-variant dark \(([^;]+)\);/)?.[1] ?? "";
    for (const t of THEMES.filter((x) => x.mode === "dark")) {
      expect(variant).toContain(`[data-theme="${t.id}"]`);
    }
    for (const t of THEMES.filter((x) => x.mode === "light")) {
      expect(variant).not.toContain(`[data-theme="${t.id}"]`);
    }
  });
});
