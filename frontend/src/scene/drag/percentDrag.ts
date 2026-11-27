/**
 * Percentage drag math (guide §12.3 row 4). Pure so the step behaviour can be
 * unit-tested without a canvas.
 */

/** Coarse step for the fill handle, the arrow keys and the buttons. */
export const PERCENT_STEP = 0.5;
/** Step while Shift is held. */
export const PERCENT_FINE_STEP = 0.1;
export const PERCENT_MIN = 0;
export const PERCENT_MAX = 100;
/** Screen pixels of vertical travel per percentage *step* (0.5 or 0.1). */
export const PERCENT_PX_PER_STEP = 2;

export function percentStepFor(fine: boolean): number {
  return fine ? PERCENT_FINE_STEP : PERCENT_STEP;
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return PERCENT_MIN;
  return Math.min(PERCENT_MAX, Math.max(PERCENT_MIN, value));
}

/** Two decimals, so repeated 0.1 steps never accumulate binary drift. */
export function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

/** One step up or down, clamped to 0…100. */
export function stepPercent(
  current: number,
  direction: 1 | -1,
  fine = false,
): number {
  return roundPercent(clampPercent(current + direction * percentStepFor(fine)));
}

export interface PercentDragResult {
  percent: number;
  /** Pixels left over after whole steps were taken. */
  carriedPx: number;
}

/**
 * Accumulates vertical pointer travel into percentage steps. Moving up
 * increases the value. `carriedPx` is threaded through successive pointer
 * events so sub-step travel is never lost.
 */
export function nextPercent(
  current: number,
  dyPx: number,
  fine: boolean,
  carriedPx = 0,
): PercentDragResult {
  const total = carriedPx + dyPx;
  const steps = Math.round(-total / PERCENT_PX_PER_STEP);
  if (steps === 0) return { percent: current, carriedPx: total };
  const step = percentStepFor(fine);
  return {
    percent: roundPercent(clampPercent(current + steps * step)),
    carriedPx: total + steps * PERCENT_PX_PER_STEP,
  };
}

/** The bin's percentage shown in the table and the totals bar. */
export function formatPercent(value: number): string {
  return String(roundPercent(value));
}
