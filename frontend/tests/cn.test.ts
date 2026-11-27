import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TYPE_SCALE_STEPS, cn } from "@/lib/utils";

/**
 * The merge engine groups an unknown `text-*` class as a colour. Because the
 * type scale adds `text-small`, `text-h1` and friends as *font sizes*, they
 * have to be registered in `cn()` or a size token silently deletes a colour
 * token that came before it. That produced a real WCAG failure: a primary
 * button kept `bg-primary` but lost `text-primary-foreground`.
 */
describe("cn keeps font sizes and text colours apart", () => {
  it("keeps a colour when a size token follows it", () => {
    const out = cn("bg-primary text-primary-foreground", "text-small");
    expect(out).toContain("text-primary-foreground");
    expect(out).toContain("text-small");
    expect(out).toContain("bg-primary");
  });

  it("keeps a colour when a size token precedes it", () => {
    const out = cn("text-small", "text-primary-foreground");
    expect(out).toContain("text-small");
    expect(out).toContain("text-primary-foreground");
  });

  it("still lets one size replace another", () => {
    expect(cn("text-body", "text-caption")).toBe("text-caption");
  });

  it("still lets one colour replace another", () => {
    expect(cn("text-muted-foreground", "text-foreground")).toBe(
      "text-foreground",
    );
  });

  it("does not confuse a built-in size with a colour either", () => {
    const out = cn("text-destructive", "text-sm");
    expect(out).toContain("text-destructive");
    expect(out).toContain("text-sm");
  });

  it("covers every step of the scale", () => {
    for (const step of TYPE_SCALE_STEPS) {
      const out = cn("text-primary-foreground", `text-${step}`);
      expect(out, `text-${step} dropped the colour`).toContain(
        "text-primary-foreground",
      );
    }
  });
});

describe("the registered scale matches globals.css", () => {
  it("declares every --text-* step the stylesheet defines", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    // Size tokens only: skip the paired --text-*--line-height / --font-weight.
    const defined = new Set(
      [...css.matchAll(/--text-([a-z0-9]+):/g)].map((m) => m[1]),
    );
    expect(defined.size).toBeGreaterThan(0);
    for (const step of defined) {
      expect(
        TYPE_SCALE_STEPS as readonly string[],
        `globals.css defines --text-${step} but cn() does not know it, so it will delete text colours`,
      ).toContain(step);
    }
  });
});
