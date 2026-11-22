/**
 * The performance ladder as pure decisions (guide §12.11): lower the device
 * pixel ratio first, then turn off real-time shadows, and only then switch to
 * the 2D view. Kept out of the component so the escalation is unit-testable.
 */

export type PerformanceEvent = "decline" | "incline";

export interface PerformanceState {
  /** Index into `steps` for the current DPR. */
  step: number;
  declines: number;
  shadows: boolean;
  /** True once the ladder has given up on 3D. */
  gaveUp: boolean;
}

export const DECLINES_BEFORE_SHADOWS = 3;
export const DECLINES_BEFORE_2D = 6;

/** DPR steps from the device cap down to 1. */
export function dprSteps(baseDpr: number): number[] {
  if (baseDpr <= 1) return [1];
  if (baseDpr <= 1.25) return [baseDpr, 1];
  if (baseDpr <= 1.5) return [baseDpr, 1.25, 1];
  return [baseDpr, 1.5, 1.25, 1];
}

export function initialPerformance(): PerformanceState {
  return { step: 0, declines: 0, shadows: true, gaveUp: false };
}

export function applyPerformanceEvent(
  state: PerformanceState,
  event: PerformanceEvent,
  steps: number[],
): PerformanceState {
  if (state.gaveUp) return state;
  if (event === "incline") {
    if (state.step === 0) return state;
    return { ...state, declines: 0, step: state.step - 1 };
  }

  const declines = state.declines + 1;
  if (declines <= DECLINES_BEFORE_SHADOWS) {
    return {
      ...state,
      declines,
      step: Math.min(state.step + 1, steps.length - 1),
    };
  }
  if (state.shadows) {
    // Shadows stay off for the rest of the session.
    return { ...state, declines, shadows: false };
  }
  if (declines >= DECLINES_BEFORE_2D) {
    return { ...state, declines: 0, gaveUp: true };
  }
  return { ...state, declines };
}
