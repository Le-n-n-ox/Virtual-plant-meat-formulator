import type { CSSProperties } from "react";
import { useReducedMotionPreference } from "@/scene/hooks/useSceneEnvironment";

/*
 * Motion tokens
 * -------------
 * One set of durations and curves for the whole app, so a hover in the
 * catalogue, a dialog opening, a tab switching and a candidate row expanding
 * all move on the same clock instead of each picking its own number.
 *
 * Durations are milliseconds here because that is the unit the design notes
 * and the CSS utilities use; `resolveMotion` converts them to the seconds
 * Motion for React expects, so no component has to divide by 1000.
 *
 * Nothing in this file loops. An animation that repeats forever is reserved
 * for an explicit live/running indicator (the job spinners and the
 * indeterminate sweep), and per guide §1 no motion may suggest a job has moved
 * on when no event said so.
 */

export const MOTION_MS = {
  /**
   * Pointer feedback: hover, press, a colour change. Short enough that the
   * change reads as a direct consequence of the pointer. It is also Tailwind's
   * default transition duration, so a plain `transition-colors` already lands
   * on this token.
   */
  hover: 150,
  /**
   * Something arriving or leaving: a dialog, a sheet, a toast, a chart on
   * mount, a table row expanding.
   */
  enter: 250,
  /**
   * A decorative flourish with no work behind it, currently only the landing
   * page's count-up. Long motion is never used next to real work, where it
   * would read as progress.
   */
  flourish: 1200,
} as const;

export type MotionDuration = keyof typeof MOTION_MS;

/**
 * Arriving motion decelerates: quick at the start so the change is noticed,
 * slow at the end so the element looks like it came to rest rather than
 * stopped. These are the control points of CSS `ease-out`, so the CSS-driven
 * transitions (the Base UI popups, Sonner) and the Motion-driven ones share
 * one curve.
 */
export const MOTION_EASE_OUT: [number, number, number, number] = [
  0, 0, 0.58, 1,
];

/** `MOTION_EASE_OUT` written as a CSS timing function. */
export const CSS_EASE_OUT = `cubic-bezier(${MOTION_EASE_OUT.join(", ")})`;

/**
 * Low-bounce spring for something settling into a new resting place: the
 * workspace tab underline, the sidebar rail, the scroll bar. The damping ratio
 * is about 0.89, so it overshoots by a fraction of a pixel and reads as
 * settling rather than bouncing.
 */
export const MOTION_SPRING_SETTLE = {
  type: "spring",
  stiffness: 500,
  damping: 40,
} as const;

/** A duration-based transition, in the shape Motion's `transition` prop takes. */
export interface MotionTween {
  /** Seconds, as Motion expects. */
  duration: number;
  ease: [number, number, number, number];
}

export interface ResolvedMotion {
  /** True when the store preference or the OS asked for less motion. */
  reduced: boolean;
  /** Hover and press feedback. */
  hover: MotionTween;
  /** An entrance or an exit. */
  enter: MotionTween;
  /**
   * Settling into a new resting place. A spring has no duration to zero out,
   * so the reduced path hands back an instant tween instead.
   */
  settle: MotionTween | typeof MOTION_SPRING_SETTLE;
  /** The same durations in milliseconds, for CSS and for raw timers. */
  ms: Record<MotionDuration, number>;
  /** Inline style putting the entrance tokens on a CSS-animated element. */
  enterStyle: CSSProperties;
  /** Inline style putting the hover tokens on a CSS-animated element. */
  hoverStyle: CSSProperties;
}

/**
 * CSS-animated components (the Base UI popups, Sonner's toasts) get their
 * timing inline rather than from a `duration-*` class, because a class can
 * only follow the media query through `motion-reduce:` and the store's
 * "Reduce" setting has to win as well.
 */
function cssTiming(ms: number): CSSProperties {
  return {
    animationDuration: `${ms}ms`,
    animationTimingFunction: CSS_EASE_OUT,
    transitionDuration: `${ms}ms`,
    transitionTimingFunction: CSS_EASE_OUT,
  };
}

/**
 * The tokens as a component should use them. Pure, so it can be tested without
 * a DOM.
 *
 * `reduced` collapses every duration to zero rather than shortening it: the
 * change still happens, it simply happens at once, which is what the guide's
 * reduced-motion rule asks for. Nothing is left mid-transition and no state is
 * only legible while something is moving.
 */
export function resolveMotion(reduced: boolean): ResolvedMotion {
  const ms: Record<MotionDuration, number> = {
    hover: reduced ? 0 : MOTION_MS.hover,
    enter: reduced ? 0 : MOTION_MS.enter,
    flourish: reduced ? 0 : MOTION_MS.flourish,
  };
  return {
    reduced,
    hover: { duration: ms.hover / 1000, ease: MOTION_EASE_OUT },
    enter: { duration: ms.enter / 1000, ease: MOTION_EASE_OUT },
    settle: reduced
      ? { duration: 0, ease: MOTION_EASE_OUT }
      : MOTION_SPRING_SETTLE,
    ms,
    enterStyle: cssTiming(ms.enter),
    hoverStyle: cssTiming(ms.hover),
  };
}

/*
 * Both outcomes are resolved once at module load. The objects are then stable
 * across renders, so handing one to a `transition` prop or a `style` prop does
 * not look like a new value to React or to Motion on every render.
 */
const FULL_MOTION = resolveMotion(false);
const REDUCED_MOTION = resolveMotion(true);

/**
 * The resolved tokens for the current user. The underlying scene hook combines
 * the preferences store's motion setting ("Follow system", "Reduce", "Full")
 * with the `prefers-reduced-motion` media query, so one answer governs the DOM
 * and the 3D scene alike.
 */
export function useMotion(): ResolvedMotion {
  return useReducedMotionPreference() ? REDUCED_MOTION : FULL_MOTION;
}
