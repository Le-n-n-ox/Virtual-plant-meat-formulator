import { describe, expect, it } from "vitest";
import {
  DROP_SETTLE_MS,
  REJECT_SHAKE_MS,
  RETURN_ARC_HEIGHT,
  RETURN_MS,
  SETTLE_SQUASH,
  blobShadow,
  clamp01,
  easeOut,
  releaseDuration,
  returnArc,
  settleScaleXZ,
  settleScaleY,
  shakeOffset,
  snapStrength,
  snapToward,
} from "@/scene/drag/releaseAnimation";

const from = { x: 0, y: 2.4, z: 0 };
const to = { x: 3, y: 0.3, z: -1 };

describe("clamp01 and easeOut", () => {
  it("clamps outside the unit interval", () => {
    expect(clamp01(-2)).toBe(0);
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(9)).toBe(1);
  });

  it("eases out: fast first, settled at the end", () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
  });
});

describe("releaseDuration", () => {
  it("gives each outcome its own time, with the shake added to a reject", () => {
    expect(releaseDuration("drop")).toBe(DROP_SETTLE_MS);
    expect(releaseDuration("cancel")).toBe(RETURN_MS);
    expect(releaseDuration("reject")).toBe(REJECT_SHAKE_MS + RETURN_MS);
  });
});

describe("settle squash", () => {
  it("starts and ends at rest", () => {
    expect(settleScaleY(0)).toBeCloseTo(1, 5);
    expect(settleScaleY(1)).toBe(1);
    expect(settleScaleXZ(0)).toBeCloseTo(1, 5);
  });

  it("squashes to about the specified depth partway through", () => {
    const lowest = Math.min(
      ...Array.from({ length: 40 }, (_, i) => settleScaleY(i / 40)),
    );
    expect(lowest).toBeLessThan(1);
    // Within a little of the 94 percent the guide asks for.
    expect(lowest).toBeGreaterThan(SETTLE_SQUASH - 0.06);
    expect(lowest).toBeLessThan(SETTLE_SQUASH + 0.04);
  });

  it("widens as it flattens, so the volume reads as preserved", () => {
    const t = 0.25;
    expect(settleScaleY(t)).toBeLessThan(1);
    expect(settleScaleXZ(t)).toBeGreaterThan(1);
  });

  it("settles back: no squash left at the end", () => {
    expect(Math.abs(settleScaleY(0.999) - 1)).toBeLessThan(0.02);
  });
});

describe("returnArc", () => {
  it("starts where released and ends where it came from", () => {
    const start = returnArc(0, from, to);
    expect(start.x).toBeCloseTo(from.x, 5);
    expect(start.z).toBeCloseTo(from.z, 5);
    const end = returnArc(1, from, to);
    expect(end.x).toBeCloseTo(to.x, 5);
    expect(end.y).toBeCloseTo(to.y, 5);
    expect(end.z).toBeCloseTo(to.z, 5);
  });

  it("arcs above the straight line in the middle", () => {
    const mid = returnArc(0.5, from, to);
    const straight = from.y + (to.y - from.y) * easeOut(0.5);
    expect(mid.y - straight).toBeCloseTo(RETURN_ARC_HEIGHT, 5);
  });
});

describe("shakeOffset", () => {
  it("begins and ends at zero so nothing is left displaced", () => {
    expect(shakeOffset(0)).toBeCloseTo(0, 6);
    expect(shakeOffset(1)).toBe(0);
  });

  it("crosses the centre once per half shake and decays", () => {
    const early = Math.abs(shakeOffset(0.12));
    const late = Math.abs(shakeOffset(0.88));
    expect(early).toBeGreaterThan(late);
  });

  it("stays small: a refusal, not a tantrum", () => {
    const peak = Math.max(
      ...Array.from({ length: 100 }, (_, i) => Math.abs(shakeOffset(i / 100))),
    );
    expect(peak).toBeLessThan(0.13);
  });
});

describe("snapStrength", () => {
  it("is nothing at the edge and strongest at the socket", () => {
    expect(snapStrength(1, 1)).toBe(0);
    expect(snapStrength(0, 1)).toBeGreaterThan(0.5);
    expect(snapStrength(0.5, 1)).toBeLessThan(snapStrength(0.1, 1));
  });

  it("never pulls an object past its socket", () => {
    for (const d of [0, 0.1, 0.4, 0.9, 1]) {
      expect(snapStrength(d, 1)).toBeLessThanOrEqual(1);
    }
  });

  it("is inert for a target with no radius", () => {
    expect(snapStrength(0, 0)).toBe(0);
  });

  it("moves a carried point toward the socket without overshooting", () => {
    const pulled = snapToward({ x: 0, z: 0 }, { x: 1, z: 0 }, 0.3, 1);
    expect(pulled.x).toBeGreaterThan(0);
    expect(pulled.x).toBeLessThan(1);
    expect(pulled.z).toBe(0);
  });
});

describe("blobShadow", () => {
  it("is full size on the floor and smaller, fainter when lifted", () => {
    const down = blobShadow(0, 2.4);
    const up = blobShadow(2.4, 2.4);
    expect(down.scale).toBeCloseTo(1, 5);
    expect(up.scale).toBeLessThan(down.scale);
    expect(up.opacity).toBeLessThan(down.opacity);
    expect(up.opacity).toBeGreaterThan(0);
  });

  it("never divides by a zero carry height", () => {
    expect(Number.isFinite(blobShadow(1, 0).scale)).toBe(true);
  });
});
