"use client";

import { useSyncExternalStore } from "react";
import { usePreferencesStore } from "@/stores/preferencesStore";

let webglSupport: boolean | null = null;

function detectWebGL(): boolean {
  if (webglSupport !== null) return webglSupport;
  try {
    const canvas = document.createElement("canvas");
    webglSupport = Boolean(
      canvas.getContext("webgl2") ?? canvas.getContext("webgl"),
    );
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

const noop = () => () => {};

/** null during SSR/hydration, then true/false. */
export function useWebGLSupport(): boolean | null {
  return useSyncExternalStore<boolean | null>(noop, detectWebGL, () => null);
}

/** Ungmasked GPU description, lower-cased, for the software-renderer check. */
function detectRenderer(): string | null {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return null;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = ext
      ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    return String(renderer ?? "").toLowerCase();
  } catch {
    return null;
  }
}

const SOFTWARE_RENDERER =
  /swiftshader|software|llvmpipe|basic render|virgl|angle \(google/;

export interface PerformanceVerdict {
  /** True when the device is unlikely to hold a comfortable 3D frame rate. */
  weak: boolean;
  reason: string | null;
}

/**
 * Cheap capability check for the 3D view. A software rasteriser or a very
 * low-end CPU/GPU gets the 2D view instead of a stuttering canvas.
 */
let cachedVerdict: PerformanceVerdict | null = null;
const UNKNOWN_VERDICT: PerformanceVerdict = { weak: false, reason: null };

function detectPerformance(): PerformanceVerdict {
  if (cachedVerdict) return cachedVerdict;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 4;
  const memory = nav.deviceMemory ?? 4;
  const renderer = detectRenderer();
  if (renderer && SOFTWARE_RENDERER.test(renderer)) {
    cachedVerdict = {
      weak: true,
      reason: "Software rendering was detected, so the 2D view is shown.",
    };
  } else if (cores > 0 && cores <= 2) {
    cachedVerdict = {
      weak: true,
      reason: "This device has very few CPU cores, so the 2D view is shown.",
    };
  } else if (memory > 0 && memory <= 2) {
    cachedVerdict = {
      weak: true,
      reason: "This device has limited memory, so the 2D view is shown.",
    };
  } else {
    cachedVerdict = { weak: false, reason: null };
  }
  return cachedVerdict;
}

/** null-ish during SSR/hydration, then the detected verdict. */
export function usePerformanceCheck(): PerformanceVerdict {
  return useSyncExternalStore(noop, detectPerformance, () => UNKNOWN_VERDICT);
}

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribeMotion(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function useSystemReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}

/** Effective reduced-motion flag: user preference overrides the OS setting. */
export function useReducedMotionPreference(): boolean {
  const motion = usePreferencesStore((s) => s.motion);
  const system = useSystemReducedMotion();
  if (motion === "reduce") return true;
  if (motion === "full") return false;
  return system;
}

export type ResolvedView = "3d" | "2d" | "pending";

/**
 * Which renderer to show. "auto" uses 3D only when WebGL works, the device
 * looks capable, and reduced motion is not requested; an explicit "3d" still
 * requires WebGL but keeps the canvas on capable and weak devices alike.
 */
export function useResolvedView(): {
  view: ResolvedView;
  reason: string | null;
} {
  const viewMode = usePreferencesStore((s) => s.viewMode);
  const webgl = useWebGLSupport();
  const reducedMotion = useReducedMotionPreference();
  const { weak, reason: performanceReason } = usePerformanceCheck();

  if (webgl === null) return { view: "pending", reason: null };
  if (!webgl)
    return { view: "2d", reason: "WebGL is not available on this device." };
  if (viewMode === "2d") return { view: "2d", reason: null };
  if (viewMode === "3d") return { view: "3d", reason: null };
  if (weak) return { view: "2d", reason: performanceReason };
  if (reducedMotion)
    return {
      view: "2d",
      reason: "Reduced motion is on, so the 2D view is shown.",
    };
  return { view: "3d", reason: null };
}
