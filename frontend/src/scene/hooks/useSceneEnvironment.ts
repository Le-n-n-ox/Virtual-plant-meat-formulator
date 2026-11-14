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
 * Which renderer to show. "auto" uses 3D only when WebGL works and reduced
 * motion is not requested; an explicit "3d" still requires WebGL.
 */
export function useResolvedView(): {
  view: ResolvedView;
  reason: string | null;
} {
  const viewMode = usePreferencesStore((s) => s.viewMode);
  const webgl = useWebGLSupport();
  const reducedMotion = useReducedMotionPreference();

  if (webgl === null) return { view: "pending", reason: null };
  if (!webgl)
    return { view: "2d", reason: "WebGL is not available on this device." };
  if (viewMode === "2d") return { view: "2d", reason: null };
  if (viewMode === "3d") return { view: "3d", reason: null };
  if (reducedMotion)
    return {
      view: "2d",
      reason: "Reduced motion is on, so the 2D view is shown.",
    };
  return { view: "3d", reason: null };
}
