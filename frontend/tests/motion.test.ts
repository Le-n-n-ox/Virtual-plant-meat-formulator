import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CSS_EASE_OUT,
  MOTION_EASE_OUT,
  MOTION_MS,
  MOTION_SPRING_SETTLE,
  resolveMotion,
  useMotion,
} from "@/lib/motion";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { stubMatchMedia } from "./_matchMedia";

/**
 * The motion tokens, and the one rule that cannot be allowed to regress: with
 * less motion asked for, every duration is zero. Not shorter, zero, so a
 * dialog, a toast, a tab underline or a candidate row changes state instantly
 * rather than briefly animating.
 *
 * The resolver is pure, so most of this needs no DOM. The last block does,
 * because the hook reads the `prefers-reduced-motion` media query: jsdom has
 * no `matchMedia`, so it is stubbed per test here rather than polyfilled in
 * the shared setup file, where it would quietly answer for every other suite.
 */

const full = resolveMotion(false);
const reduced = resolveMotion(true);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  usePreferencesStore.setState({ motion: "system" });
});

describe("the motion tokens", () => {
  it("keeps pointer feedback faster than an entrance", () => {
    expect(MOTION_MS.hover).toBe(150);
    expect(MOTION_MS.enter).toBe(250);
    expect(MOTION_MS.hover).toBeLessThan(MOTION_MS.enter);
  });

  it("arrives on an ease-out curve, in CSS and in Motion alike", () => {
    // A deceleration: the curve leaves the start at full tilt and flattens as
    // it reaches the end.
    expect(MOTION_EASE_OUT[3]).toBe(1);
    expect(MOTION_EASE_OUT[2]).toBeLessThan(1);
    expect(CSS_EASE_OUT).toBe("cubic-bezier(0, 0, 0.58, 1)");
  });

  it("settles on a spring that is damped well below a bounce", () => {
    const { stiffness, damping } = MOTION_SPRING_SETTLE;
    // Damping ratio for the default mass of 1; under 1 but close to it, so the
    // overshoot is a fraction of a pixel.
    const ratio = damping / (2 * Math.sqrt(stiffness));
    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(1);
  });
});

describe("resolveMotion with less motion asked for", () => {
  it("returns zero, not merely less, for every duration", () => {
    expect(reduced.reduced).toBe(true);
    expect(reduced.hover.duration).toBe(0);
    expect(reduced.enter.duration).toBe(0);
    // Every token, including any added later, not just the two above.
    expect(Object.values(reduced.ms)).toEqual(
      Object.keys(MOTION_MS).map(() => 0),
    );
  });

  it("swaps the spring for an instant tween, since a spring has no duration", () => {
    expect(reduced.settle).toEqual({ duration: 0, ease: MOTION_EASE_OUT });
    expect(reduced.settle).not.toHaveProperty("type");
  });

  it("zeroes the inline styles the CSS-animated components use", () => {
    expect(reduced.enterStyle.animationDuration).toBe("0ms");
    expect(reduced.enterStyle.transitionDuration).toBe("0ms");
    expect(reduced.hoverStyle.animationDuration).toBe("0ms");
    expect(reduced.hoverStyle.transitionDuration).toBe("0ms");
  });
});

describe("resolveMotion with motion allowed", () => {
  it("hands Motion its seconds and CSS its milliseconds", () => {
    expect(full.reduced).toBe(false);
    expect(full.hover.duration).toBeCloseTo(MOTION_MS.hover / 1000, 5);
    expect(full.enter.duration).toBeCloseTo(MOTION_MS.enter / 1000, 5);
    expect(full.ms).toEqual({
      hover: MOTION_MS.hover,
      enter: MOTION_MS.enter,
      flourish: MOTION_MS.flourish,
    });
    expect(full.enterStyle.transitionDuration).toBe(`${MOTION_MS.enter}ms`);
    expect(full.hoverStyle.transitionDuration).toBe(`${MOTION_MS.hover}ms`);
  });

  it("settles on the shared spring", () => {
    expect(full.settle).toBe(MOTION_SPRING_SETTLE);
  });
});

describe("useMotion", () => {
  it("follows the media query when the preference is 'Follow system'", () => {
    stubMatchMedia(true);
    usePreferencesStore.setState({ motion: "system" });
    expect(renderHook(() => useMotion()).result.current).toEqual(reduced);
  });

  it("reduces on the store setting even when the OS has not asked", () => {
    stubMatchMedia(false);
    usePreferencesStore.setState({ motion: "reduce" });
    expect(renderHook(() => useMotion()).result.current).toEqual(reduced);
  });

  it("lets a deliberate 'Full' override the media query", () => {
    stubMatchMedia(true);
    usePreferencesStore.setState({ motion: "full" });
    expect(renderHook(() => useMotion()).result.current).toEqual(full);
  });
});
