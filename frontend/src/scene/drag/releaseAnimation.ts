/**
 * The motion of a released object (guide §12.5), as pure functions so the
 * curves can be unit-tested without a renderer.
 *
 * | Moment          | Motion                                  | Duration |
 * | --------------- | --------------------------------------- | -------- |
 * | Drop            | settle with a squash to 94% and back     | 280 ms   |
 * | Cancel          | return along a low arc                   | 340 ms   |
 * | Reject          | three small shakes, then the return arc  | 180 ms + |
 *
 * None of this claims progress or carries meaning: it is cause-and-effect
 * feedback for a draft edit the user just made.
 */

export const DROP_SETTLE_MS = 280;
export const RETURN_MS = 340;
export const REJECT_SHAKE_MS = 180;
/** Shakes performed before a rejected object returns. */
export const REJECT_SHAKES = 3;
/** Sideways travel of one shake, in world units. */
export const SHAKE_AMPLITUDE = 0.12;
/** Peak height of the return arc above the straight line, in world units. */
export const RETURN_ARC_HEIGHT = 0.55;
/** Squash at the deepest point of a drop settle. */
export const SETTLE_SQUASH = 0.94;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Total time a release animation occupies, by outcome. */
export function releaseDuration(outcome: "drop" | "cancel" | "reject"): number {
  if (outcome === "drop") return DROP_SETTLE_MS;
  if (outcome === "reject") return REJECT_SHAKE_MS + RETURN_MS;
  return RETURN_MS;
}

/** Clamps to the unit interval. */
export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Ease-out cubic: things arriving decelerate. */
export function easeOut(t: number): number {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 3);
}

/**
 * Vertical scale of a dropped object settling into its socket: squashes to
 * `SETTLE_SQUASH` at a third of the way through, then springs back to 1 with a
 * little overshoot. Returns 1 outside the animation.
 */
export function settleScaleY(t: number): number {
  const x = clamp01(t);
  if (x >= 1) return 1;
  // One damped half-cycle: down, back up past 1, settle.
  const decay = Math.exp(-4.2 * x);
  const wave = Math.sin(Math.PI * x * 1.5);
  return 1 - (1 - SETTLE_SQUASH) * wave * decay * 2.2;
}

/** The horizontal counter-scale of a squash, so volume reads as preserved. */
export function settleScaleXZ(t: number): number {
  const y = settleScaleY(t);
  return 1 + (1 - y) * 0.5;
}

/**
 * Position along the return arc from `from` back to `to`. The arc is low and
 * quick: it reads as the object being put back, not thrown.
 */
export function returnArc(t: number, from: Vec3, to: Vec3): Vec3 {
  const x = clamp01(t);
  const e = easeOut(x);
  // sin gives 0 at both ends and 1 at the midpoint, so the lift is an arc.
  const lift = Math.sin(Math.PI * x) * RETURN_ARC_HEIGHT;
  return {
    x: from.x + (to.x - from.x) * e,
    y: from.y + (to.y - from.y) * e + lift,
    z: from.z + (to.z - from.z) * e,
  };
}

/**
 * Sideways offset of a rejected object: `REJECT_SHAKES` shakes that fade out,
 * so the refusal is legible without being violent.
 */
export function shakeOffset(t: number): number {
  const x = clamp01(t);
  if (x >= 1) return 0;
  return Math.sin(x * Math.PI * 2 * REJECT_SHAKES) * SHAKE_AMPLITUDE * (1 - x);
}

/**
 * How strongly a carried object is pulled toward a target's socket (guide
 * §12.3: "It is pulled gently toward the target's socket").
 *
 * 0 at the edge of the hit radius and `max` at the centre, eased so the pull
 * appears as the object nears the socket instead of snapping at the boundary.
 */
export function snapStrength(
  distance: number,
  radius: number,
  max = 0.72,
): number {
  if (radius <= 0) return 0;
  const inside = 1 - clamp01(distance / radius);
  return easeOut(inside) * max;
}

/** Blends a carried position toward a socket by `snapStrength`. */
export function snapToward(
  point: { x: number; z: number },
  socket: { x: number; z: number },
  distance: number,
  radius: number,
): { x: number; z: number } {
  const k = snapStrength(distance, radius);
  return {
    x: point.x + (socket.x - point.x) * k,
    z: point.z + (socket.z - point.z) * k,
  };
}

/**
 * Scale and opacity of the blob shadow under a carried object. The shadow
 * shrinking and fading as the object rises is the single cue that does most of
 * the work of making a drag feel physical (guide §12.4).
 */
export function blobShadow(
  lift: number,
  carryHeight: number,
): { scale: number; opacity: number } {
  const t = clamp01(lift / Math.max(carryHeight, 0.001));
  return {
    scale: 1 - t * 0.42,
    opacity: (1 - t * 0.62) * 0.22,
  };
}
