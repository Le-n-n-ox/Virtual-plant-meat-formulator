import { describe, expect, it } from "vitest";
import {
  DECLINES_BEFORE_2D,
  DECLINES_BEFORE_SHADOWS,
  applyPerformanceEvent,
  dprSteps,
  initialPerformance,
} from "@/scene/performance/performancePolicy";

const desktop = dprSteps(2);
const phone = dprSteps(1.5);

describe("dprSteps", () => {
  it("caps desktop at 2 and a phone at 1.5", () => {
    expect(desktop).toEqual([2, 1.5, 1.25, 1]);
    expect(phone).toEqual([1.5, 1.25, 1]);
  });

  it("never goes below 1", () => {
    expect(dprSteps(1)).toEqual([1]);
    expect(dprSteps(1.25)).toEqual([1.25, 1]);
  });
});

describe("the performance ladder", () => {
  it("spends the first declines lowering DPR", () => {
    expect(DECLINES_BEFORE_SHADOWS).toBe(3);
    let state = initialPerformance();
    for (let i = 0; i < DECLINES_BEFORE_SHADOWS; i += 1) {
      state = applyPerformanceEvent(state, "decline", desktop);
    }
    expect(state.step).toBe(3);
    expect(desktop[state.step]).toBe(1);
    expect(state.shadows).toBe(true);
    expect(state.gaveUp).toBe(false);
  });

  it("turns shadows off before it gives up", () => {
    let state = initialPerformance();
    for (let i = 0; i < DECLINES_BEFORE_SHADOWS + 1; i += 1) {
      state = applyPerformanceEvent(state, "decline", desktop);
    }
    expect(state.shadows).toBe(false);
    expect(state.gaveUp).toBe(false);
  });

  it("switches to 2D only after the shadow step has had its chance", () => {
    expect(DECLINES_BEFORE_2D).toBe(6);
    let state = initialPerformance();
    for (let i = 0; i < DECLINES_BEFORE_2D - 1; i += 1) {
      state = applyPerformanceEvent(state, "decline", desktop);
    }
    expect(state.gaveUp).toBe(false);
    state = applyPerformanceEvent(state, "decline", desktop);
    expect(state.gaveUp).toBe(true);
  });

  it("recovers DPR on an incline but never re-enables shadows", () => {
    let state = initialPerformance();
    for (let i = 0; i < DECLINES_BEFORE_SHADOWS + 1; i += 1) {
      state = applyPerformanceEvent(state, "decline", desktop);
    }
    expect(state.shadows).toBe(false);
    const recovered = applyPerformanceEvent(state, "incline", desktop);
    expect(recovered.shadows).toBe(false);
    expect(recovered.declines).toBe(0);
  });

  it("does nothing once it has given up", () => {
    let state = initialPerformance();
    for (let i = 0; i < DECLINES_BEFORE_2D; i += 1) {
      state = applyPerformanceEvent(state, "decline", desktop);
    }
    expect(state.gaveUp).toBe(true);
    expect(applyPerformanceEvent(state, "incline", desktop)).toBe(state);
  });

  it("reaches the floor on a phone sooner", () => {
    let state = initialPerformance();
    for (let i = 0; i < DECLINES_BEFORE_SHADOWS; i += 1) {
      state = applyPerformanceEvent(state, "decline", phone);
    }
    expect(phone[state.step]).toBe(1);
  });
});
