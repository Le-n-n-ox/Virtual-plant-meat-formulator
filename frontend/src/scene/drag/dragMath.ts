/**
 * Pure drag geometry and thresholds (guide §12.3).
 *
 * Kept free of React and three.js so the thresholds, the plane intersection and
 * the drop resolution can be unit-tested directly.
 */

/** Pointer must move this far (mouse, stylus) before a drag starts. */
export const MOUSE_MOVE_THRESHOLD_PX = 6;
/** Touch must be held this long before a drag starts, so taps still orbit. */
export const TOUCH_HOLD_MS = 180;
/**
 * Height a carried object is drawn at, above the point it would land on.
 *
 * Note this is a drawing height only. The pointer is projected onto the bench
 * (`BENCH_LEVEL`), not onto a plane up here: a plane at carry height sits
 * between the camera and the bench, so a screen point that looks like it is
 * over the vessel resolves several units in front of it. The object hovers
 * above the bench point instead, with its shadow marking the landing spot.
 */
export const CARRY_HEIGHT = 2.1;

/** The bench top: the surface every drop target stands on. */
export const BENCH_LEVEL = 0;

/** Extra lift once an object is grabbed, on top of `CARRY_HEIGHT`. */
export const CARRY_LIFT = 0.35;

/** Height a carried object is actually drawn at. */
export const CARRY_TOP = CARRY_HEIGHT + CARRY_LIFT;
/** How close a carried object must come to a target to count as "over" it. */
export const DROP_RADIUS = 0.9;
/** Largest tilt, in degrees, applied in the direction of travel. */
export const MAX_TILT_DEG = 8;
/** Drop hit volumes are 30 percent larger than the visible model. */
export const HIT_VOLUME_SCALE = 1.3;

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Ray {
  origin: Vec3;
  direction: Vec3;
}

export interface WorldTarget<T extends string = string> {
  id: T;
  x: number;
  z: number;
  radius?: number;
}

export interface RectTarget<T extends string = string> {
  id: T;
  /** Client-pixel rect. */
  rect: { left: number; top: number; right: number; bottom: number };
}

/**
 * True once a pressed pointer has earned a drag. Touch uses the hold timer so a
 * one-finger orbit never becomes a drag; everything else uses the 6 px move.
 */
export function shouldStartDrag(input: {
  pointerType: string;
  heldMs: number;
  from: Vec2;
  to: Vec2;
}): boolean {
  if (input.pointerType === "touch") return input.heldMs >= TOUCH_HOLD_MS;
  return distance(input.from, input.to) > MOUSE_MOVE_THRESHOLD_PX;
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Intersect a ray with the horizontal plane at `height`. Returns the world
 * `(x, z)` point, or null when the ray is parallel to or pointing away from the
 * plane.
 */
export function intersectPlane(
  ray: Ray,
  height: number = BENCH_LEVEL,
): { x: number; z: number } | null {
  const dy = ray.direction.y;
  if (Math.abs(dy) < 1e-6) return null;
  const t = (height - ray.origin.y) / dy;
  if (!Number.isFinite(t) || t < 0) return null;
  return {
    x: ray.origin.x + ray.direction.x * t,
    z: ray.origin.z + ray.direction.z * t,
  };
}

/**
 * How much larger a target's radius is once the carried object is already over
 * it. Without this hysteresis a pointer resting near the boundary flickers the
 * target on and off, and a release at the wrong instant does nothing.
 */
export const TARGET_STICKINESS = 1.3;

/**
 * The closest target whose radius contains the point, or null.
 *
 * `current` is the target the drag is already over; it keeps a slightly larger
 * radius so the drop point is not lost to a pixel of jitter or a frame of
 * camera settling.
 */
export function nearestWorldTarget<T extends string>(
  point: { x: number; z: number },
  targets: WorldTarget<T>[],
  current: T | null = null,
): T | null {
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const target of targets) {
    const d = Math.hypot(point.x - target.x, point.z - target.z);
    const base = target.radius ?? DROP_RADIUS;
    const radius = target.id === current ? base * TARGET_STICKINESS : base;
    // Compare by how deeply the point sits inside each target, so a sticky
    // target does not beat one the pointer is genuinely closer to.
    const depth = d / radius;
    if (depth <= 1 && depth < bestDistance) {
      best = target.id;
      bestDistance = depth;
    }
  }
  return best;
}

/** The rect containing the pointer, or null. */
export function rectTarget<T extends string>(
  point: Vec2,
  targets: RectTarget<T>[],
): T | null {
  for (const target of targets) {
    const { left, top, right, bottom } = target.rect;
    if (
      point.x >= left &&
      point.x <= right &&
      point.y >= top &&
      point.y <= bottom
    ) {
      return target.id;
    }
  }
  return null;
}

/** True when the pointer lies inside the given client-pixel rect. */
export function inRect(
  point: Vec2,
  rect: { left: number; top: number; right: number; bottom: number },
): boolean {
  return rectTarget(point, [{ id: "only", rect }]) === "only";
}
/** Tilt in radians towards the direction of travel, capped at 8 degrees. */
export function tiltForVelocity(vx: number): number {
  const deg = Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, vx * 0.6));
  return (deg * Math.PI) / 180;
}

/** Hit-volume radius for a visible model of `radius`, enlarged by 30 percent. */
export function hitVolume(radius: number): number {
  return radius * HIT_VOLUME_SCALE;
}
