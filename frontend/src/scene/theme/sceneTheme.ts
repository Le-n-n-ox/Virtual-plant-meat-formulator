"use client";

import { useSyncExternalStore } from "react";

/**
 * Bridges CSS theme tokens (src/app/globals.css, `--scene-*`) to Three.js.
 *
 * Three.js cannot parse `oklch()`, so each token is resolved to sRGB through a
 * 1×1 canvas. The result is cached per `data-theme` value and recomputed when
 * the <html> theme attribute changes (MutationObserver), so the scene follows
 * every theme switch without a reload.
 */
export interface SceneTheme {
  key: string;
  dark: boolean;
  bg: string;
  bg2: string;
  floor: string;
  grid: string;
  gridStrong: string;
  metal: string;
  glass: string;
  surface: string;
  line: string;
  glow: string;
  accent: string;
  product: string;
  active: string;
  complete: string;
  warning: string;
  failed: string;
  idle: string;
  crops: string[];
  ambient: number;
  key_light: number;
}

const COLOR_TOKENS = {
  bg: "--scene-bg",
  bg2: "--scene-bg-2",
  floor: "--scene-floor",
  grid: "--scene-grid",
  gridStrong: "--scene-grid-strong",
  metal: "--scene-metal",
  glass: "--scene-glass",
  surface: "--scene-surface",
  line: "--scene-line",
  glow: "--scene-glow",
  accent: "--scene-accent",
  product: "--scene-product",
  active: "--scene-active",
  complete: "--scene-complete",
  warning: "--scene-warning",
  failed: "--scene-failed",
  idle: "--scene-idle",
} as const;

export const CROP_TOKEN_COUNT = 6;

/** Used for SSR and as a last resort if tokens cannot be read. */
export const FALLBACK_SCENE_THEME: SceneTheme = {
  key: "fallback",
  dark: false,
  bg: "#eef2f5",
  bg2: "#d7dfe6",
  floor: "#e6ebef",
  grid: "#b9c4cc",
  gridStrong: "#9fabB5",
  metal: "#c5ccd3",
  glass: "#f2f7fa",
  surface: "#ffffff",
  line: "#dde3e8",
  glow: "#13847b",
  accent: "#13847b",
  product: "#b98a5a",
  active: "#3a6fd8",
  complete: "#2f9a5c",
  warning: "#d69a1f",
  failed: "#d13f32",
  idle: "#b4bac1",
  crops: ["#4fb37a", "#e3b843", "#cf3f78", "#5585c9", "#e07b3c", "#8e63c4"],
  ambient: 0.75,
  key_light: 1.6,
};

let ctx: CanvasRenderingContext2D | null = null;

function toHex(cssColor: string): string | null {
  if (!cssColor) return null;
  if (!ctx) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    ctx = canvas.getContext("2d", { willReadFrequently: true });
  }
  if (!ctx) return null;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = "#000";
  ctx.fillStyle = cssColor;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function readSceneTheme(
  element: Element = document.documentElement,
): SceneTheme {
  const style = getComputedStyle(element);
  const read = (token: string, fallback: string) =>
    toHex(style.getPropertyValue(token).trim()) ?? fallback;
  const num = (token: string, fallback: number) => {
    const n = Number.parseFloat(style.getPropertyValue(token));
    return Number.isFinite(n) ? n : fallback;
  };

  const colors = Object.fromEntries(
    Object.entries(COLOR_TOKENS).map(([name, token]) => [
      name,
      read(token, FALLBACK_SCENE_THEME[name as keyof typeof COLOR_TOKENS]),
    ]),
  ) as Pick<SceneTheme, keyof typeof COLOR_TOKENS>;

  const crops = Array.from({ length: CROP_TOKEN_COUNT }, (_, i) =>
    read(`--scene-crop-${i + 1}`, FALLBACK_SCENE_THEME.crops[i]),
  );

  return {
    key: element.getAttribute("data-theme") ?? "default",
    dark: style.colorScheme.includes("dark"),
    ...colors,
    crops,
    ambient: num("--scene-ambient", FALLBACK_SCENE_THEME.ambient),
    key_light: num("--scene-key", FALLBACK_SCENE_THEME.key_light),
  };
}

let cached: SceneTheme | null = null;

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(() => {
    cached = null;
    onChange();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "class", "style"],
  });
  return () => observer.disconnect();
}

function getSnapshot(): SceneTheme {
  const key = document.documentElement.getAttribute("data-theme") ?? "default";
  if (!cached || cached.key !== key) cached = readSceneTheme();
  return cached;
}

/** Current scene palette; re-renders subscribers when the theme changes. */
export function useSceneTheme(): SceneTheme {
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => FALLBACK_SCENE_THEME,
  );
}

/** Stable colour for the n-th ingredient in a formulation. */
export function cropColor(theme: SceneTheme, index: number): string {
  return theme.crops[index % theme.crops.length];
}

/** CSS variable for the n-th crop colour (for DOM/SVG renderers). */
export function cropVar(index: number): string {
  return `var(--scene-crop-${(index % CROP_TOKEN_COUNT) + 1})`;
}

/**
 * Blender material name → the theme field that tints it (guide §12.9).
 *
 * `MAT_Crop` is resolved per instance (the ingredient's `--scene-crop-n`), and
 * `MAT_Natural` is deliberately absent: the crop toppers keep their own colours.
 */
export const MATERIAL_TINTS: Record<string, keyof SceneTheme | null> = {
  MAT_Bench: "floor",
  MAT_Surface: "surface",
  MAT_Metal: "metal",
  MAT_Glass: "glass",
  MAT_Dark: "line",
  MAT_Accent: "accent",
  MAT_Status: "active",
  MAT_Product: "product",
  MAT_Crop: "crops",
  MAT_Natural: null,
};

/**
 * Resolves the tints for one theme. `MAT_Crop` is represented by the crop list,
 * so callers pass the specific instance colour through `applyMaterialTints`.
 */
export function themeMaterialTints(theme: SceneTheme): Record<string, string> {
  const tints: Record<string, string> = {};
  for (const [material, field] of Object.entries(MATERIAL_TINTS)) {
    if (field === null) continue;
    const value = theme[field];
    if (typeof value === "string") tints[material] = value;
    else if (Array.isArray(value)) tints[material] = value[0];
  }
  return tints;
}

/**
 * Walks a loaded model once and binds each named material to the theme, so a
 * theme switch recolours the scene without reloading any GLB. `instanceColours`
 * overrides a material name (used for `MAT_Crop`, which is per ingredient).
 */
export function applyMaterialTints(
  root: object,
  theme: SceneTheme,
  instanceColours: Record<string, string> = {},
): void {
  const tints = themeMaterialTints(theme);
  const visit = (child: unknown) => {
    const mesh = child as {
      isMesh?: boolean;
      name?: string;
      material?: unknown;
      children?: unknown[];
    };
    if (mesh.isMesh) {
      const materials = (
        Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      ) as { name?: string; color?: { set: (value: string) => void } }[];
      for (const material of materials) {
        const override = material?.name
          ? instanceColours[material.name]
          : undefined;
        const tint =
          override ?? (material?.name ? tints[material.name] : undefined);
        if (tint && material?.color) material.color.set(tint);
      }
    }
    for (const next of mesh.children ?? []) visit(next);
  };
  visit(root);
}
