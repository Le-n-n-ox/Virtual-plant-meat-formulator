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
