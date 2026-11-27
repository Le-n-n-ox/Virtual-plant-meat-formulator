import type { IngredientFacets } from "@/types";

/**
 * Crop → model mapping (guide §12.8).
 *
 * The catalogue holds hundreds of foods, so crops are not modelled one by one:
 * an ingredient is shown as a **container chosen by its form** (crate for whole
 * or raw, sack for flour, jar for isolates and powders, bottle for oils and
 * liquids) with a **topper chosen by its crop** — a small heap of that crop in
 * the container. Anything without a modelled topper falls back to
 * `Crop_Generic`.
 *
 * The mapping is seeded from `GET /api/ingredients/facets`, most common crop
 * first, so the toppers that actually appear get modelled first.
 */

export type ContainerKind = "crate" | "sack" | "jar" | "bottle";

export const CONTAINER_KINDS: ContainerKind[] = [
  "crate",
  "sack",
  "jar",
  "bottle",
];

/**
 * Node names as they are exported by `scripts/blender/build_assets.py`, which
 * names each container `Container_<kind>` in lower case. The code finds parts
 * by name, so these must match `crops.glb` exactly.
 */
export const CONTAINER_NODE: Record<ContainerKind, string> = {
  crate: "Container_crate",
  sack: "Container_sack",
  jar: "Container_jar",
  bottle: "Container_bottle",
};

export const GENERIC_TOPPER = "Crop_Generic";

/** Modelled toppers, keyed by a normalised crop name. */
const TOPPERS: Record<string, string> = {
  sorghum: "Crop_Sorghum",
  millet: "Crop_Millet",
  maize: "Crop_Maize",
  corn: "Crop_Maize",
  cowpea: "Crop_Cowpea",
  pigeonpea: "Crop_PigeonPea",
  greengram: "Crop_GreenGram",
  beans: "Crop_Beans",
  mungbean: "Crop_MungBean",
  sesame: "Crop_Sesame",
  sunflower: "Crop_Sunflower",
  groundnut: "Crop_Groundnut",
  peanut: "Crop_Groundnut",
  cassava: "Crop_Cassava",
};

export const TOPPER_NAMES: string[] = [
  ...new Set(Object.values(TOPPERS)),
  GENERIC_TOPPER,
];

/**
 * Natural colour of each topper (guide §12.4: "Crops keep their natural
 * colours … because that is how a food scientist recognises them").
 *
 * `crops.glb` gives every topper the one shared `MAT_Natural` material, so the
 * colour is applied per instance in the scene rather than baked per crop. These
 * values mirror the `CROPS` table in `scripts/blender/build_assets.py`; change
 * both together. They are not tinted by the theme — they are the only
 * untinted colours in the scene, which is what makes the crops the thing the
 * eye goes to.
 */
export const TOPPER_COLOR: Record<string, string> = {
  Crop_Sorghum: "#6b3320",
  Crop_Millet: "#c7ae57",
  Crop_Maize: "#ebbd3d",
  Crop_Cowpea: "#dbcc9e",
  Crop_PigeonPea: "#b88542",
  Crop_GreenGram: "#5c943d",
  Crop_Beans: "#8c3833",
  Crop_MungBean: "#669e47",
  Crop_Sesame: "#e0d1a8",
  Crop_Sunflower: "#7a7a80",
  Crop_Groundnut: "#ccae7a",
  Crop_Cassava: "#d6c7ad",
  [GENERIC_TOPPER]: "#b8a98f",
};

/** The natural colour for a topper node, falling back to the generic heap. */
export function topperColor(topper: string): string {
  return TOPPER_COLOR[topper] ?? TOPPER_COLOR[GENERIC_TOPPER];
}

/** Lower-cases and strips everything that is not a letter or a digit. */
function normalise(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** A container kind for an ingredient form. */
export function containerForForm(
  form: string | null | undefined,
): ContainerKind {
  const key = normalise(form ?? "");
  if (!key) return "crate";
  if (/flour|powder|meal|isolate|concentrate|protein|starch/.test(key)) {
    return "sack";
  }
  if (/oil|liquid|juice|sauce|drink|syrup|extract/.test(key)) return "bottle";
  if (/raw|whole|fresh|grain|seed|nut|root|tuber/.test(key)) return "crate";
  if (/granule|flake|chip/.test(key)) return "jar";
  return "crate";
}

/** The modelled topper for a crop name, or `Crop_Generic`. */
export function topperForCrop(
  crop: string | null | undefined,
  seeded?: Record<string, string>,
): string {
  const key = normalise(crop ?? "");
  if (!key) return GENERIC_TOPPER;
  const known = TOPPERS[key];
  if (known) return known;
  return seeded?.[key] ?? GENERIC_TOPPER;
}

export interface CropModelSeed {
  /** Normalised crop name → topper node. */
  byCrop: Record<string, string>;
  /** Crop names the catalogue actually contains, most common first. */
  crops: { name: string; count: number }[];
}

/**
 * Seeds the crop → topper mapping from the catalogue facets. Anything the kit
 * models is bound by name; everything else falls back to `Crop_Generic`, which
 * is what the guide asks for rather than inventing a topper per ingredient.
 */
export function seedCropModels(facets: IngredientFacets): CropModelSeed {
  const crops = [...facets.crops]
    .filter((entry) => entry.value)
    .sort((a, b) => b.count - a.count);
  const byCrop: Record<string, string> = {};
  for (const entry of crops) {
    const key = normalise(entry.value as string);
    if (!key || byCrop[key]) continue;
    byCrop[key] = TOPPERS[key] ?? GENERIC_TOPPER;
  }
  return {
    byCrop,
    crops: crops.map((c) => ({ name: c.value as string, count: c.count })),
  };
}

/** True when the crop has a modelled topper of its own. */
export function hasOwnTopper(crop: string | null | undefined): boolean {
  return TOPPERS[normalise(crop ?? "")] !== undefined;
}
