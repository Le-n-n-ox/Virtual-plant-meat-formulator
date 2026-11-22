import { describe, expect, it } from "vitest";
import {
  PERCENT_FINE_STEP,
  PERCENT_MAX,
  PERCENT_MIN,
  PERCENT_PX_PER_STEP,
  PERCENT_STEP,
  clampPercent,
  formatPercent,
  nextPercent,
  percentStepFor,
  roundPercent,
  stepPercent,
} from "@/scene/drag/percentDrag";

describe("percent steps", () => {
  it("uses 0.5 steps, and 0.1 with Shift", () => {
    expect(PERCENT_STEP).toBe(0.5);
    expect(PERCENT_FINE_STEP).toBe(0.1);
    expect(percentStepFor(false)).toBe(0.5);
    expect(percentStepFor(true)).toBe(0.1);
  });

  it("steps up and down", () => {
    expect(stepPercent(20, 1)).toBe(20.5);
    expect(stepPercent(20, -1)).toBe(19.5);
    expect(stepPercent(20, 1, true)).toBe(20.1);
    expect(stepPercent(20, -1, true)).toBe(19.9);
  });

  it("clamps to 0…100", () => {
    expect(PERCENT_MIN).toBe(0);
    expect(PERCENT_MAX).toBe(100);
    expect(stepPercent(0, -1)).toBe(0);
    expect(stepPercent(100, 1)).toBe(100);
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(140)).toBe(100);
    expect(clampPercent(Number.NaN)).toBe(0);
  });

  it("does not accumulate binary drift", () => {
    let value = 0;
    for (let i = 0; i < 3; i += 1) value = stepPercent(value, 1, true);
    expect(value).toBe(0.3);
    expect(roundPercent(0.1 + 0.2)).toBe(0.3);
    expect(formatPercent(20.5)).toBe("20.5");
  });
});

describe("drag to percent", () => {
  it("moves up for upward travel", () => {
    expect(PERCENT_PX_PER_STEP).toBe(2);
    // Two pixels up is one coarse step.
    expect(nextPercent(20, -2, false).percent).toBe(20.5);
    expect(nextPercent(20, 2, false).percent).toBe(19.5);
  });

  it("carries sub-step travel between pointer events", () => {
    const first = nextPercent(20, -0.5, false);
    expect(first.percent).toBe(20);
    expect(first.carriedPx).toBe(-0.5);
    const second = nextPercent(first.percent, -1.5, false, first.carriedPx);
    expect(second.percent).toBe(20.5);
    expect(second.carriedPx).toBe(0);
  });

  it("switches to fine steps while Shift is held", () => {
    const result = nextPercent(20, -1, true);
    expect(result.percent).toBe(20.1);
  });

  it("clamps a drag at the ends", () => {
    expect(nextPercent(99.9, -1000, false).percent).toBe(100);
    expect(nextPercent(0.1, 1000, false).percent).toBe(0);
  });

  it("accumulates across many small events without losing distance", () => {
    let percent = 20;
    let carried = 0;
    for (let i = 0; i < 10; i += 1) {
      const result = nextPercent(percent, -1, false, carried);
      percent = result.percent;
      carried = result.carriedPx;
    }
    // Ten pixels is five coarse steps.
    expect(percent).toBe(22.5);
    expect(carried).toBe(0);
  });
});
