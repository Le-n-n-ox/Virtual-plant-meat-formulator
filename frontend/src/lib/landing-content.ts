/** Shared landing-page content. Kept in one place so sections stay in sync. */

export const CROPS = [
  "Cowpea",
  "Bambara groundnut",
  "Amaranth",
  "Sorghum",
  "Finger millet",
  "Pigeon pea",
  "Green gram",
  "Lablab bean",
] as const;

/** How many `--scene-crop-*` tokens globals.css defines. */
const CROP_TOKEN_COUNT = 6;

/**
 * Crop-identity colour for the n-th crop, as a CSS variable.
 *
 * `cropVar` in scene/theme/sceneTheme.ts returns the same string, but that
 * module is marked "use client", so a server-rendered landing section cannot
 * call it. Keeping a copy here lets the crop grid stay a server component and
 * still use the colour the tables, the charts and the 3D scene use for that
 * ingredient.
 */
export function cropToken(index: number): string {
  return `var(--scene-crop-${(index % CROP_TOKEN_COUNT) + 1})`;
}

export const CROP_BLURBS: Record<string, string> = {
  Cowpea: "High-protein flour base",
  "Bambara groundnut": "Drought-tolerant legume",
  Amaranth: "Complete amino-acid profile",
  Sorghum: "Fibre and bulk",
  "Finger millet": "High calcium",
  "Pigeon pea": "Deep-rooted nitrogen fixer",
  "Green gram": "Fast-growing protein",
  "Lablab bean": "Resilient forage legume",
};
