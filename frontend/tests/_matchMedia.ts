import { vi } from "vitest";

/**
 * jsdom has no `window.matchMedia`, and the shared reduced-motion hook behind
 * `useMotion` queries it, so any test rendering a dialog, a sheet, a chart, a
 * toast or the workspace tabs needs one.
 *
 * It is stubbed per suite rather than polyfilled in `vitest.setup.ts`, because
 * a global stub would quietly answer "no preference" for every other suite,
 * including the ones whose subject is the preference itself.
 *
 * @param prefersReducedMotion what `(prefers-reduced-motion: reduce)` answers.
 */
export function stubMatchMedia(prefersReducedMotion = false): void {
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    matches:
      prefersReducedMotion && media.includes("prefers-reduced-motion: reduce"),
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}
