/**
 * Theme registry. Colour values live in src/app/globals.css under
 * `[data-theme="<id>"]`; this file only holds metadata for pickers and the
 * light/dark mode each theme belongs to. Swatches are approximate previews.
 */
export type ThemeMode = "light" | "dark";

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  description: string;
  mode: ThemeMode;
  /** Preview swatches: background, surface, primary, accent. */
  swatches: [string, string, string, string];
}

export const THEME_IDS = [
  "light",
  "dark",
  "savanna",
  "highland",
  "lagoon",
  "ember",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const THEMES: readonly ThemeDefinition[] = [
  {
    id: "light",
    label: "Lab",
    description: "Clean, clinical daylight with teal accents.",
    mode: "light",
    swatches: ["#f9fbfc", "#ffffff", "#167f78", "#e3f4f1"],
  },
  {
    id: "dark",
    label: "Lab Night",
    description: "Deep navy workstation for long sessions.",
    mode: "dark",
    swatches: ["#0f1a2b", "#162337", "#5cc8bb", "#1e3a45"],
  },
  {
    id: "savanna",
    label: "Savanna",
    description: "Warm sorghum, sand and terracotta.",
    mode: "light",
    swatches: ["#fbf5e9", "#fdfaf2", "#b5532a", "#f4e3bf"],
  },
  {
    id: "highland",
    label: "Highland",
    description: "Fresh tea-field greens.",
    mode: "light",
    swatches: ["#f5fbf5", "#fbfefb", "#2f7a46", "#dcefd8"],
  },
  {
    id: "lagoon",
    label: "Lagoon",
    description: "Lake-at-dusk blues and cyan.",
    mode: "dark",
    swatches: ["#0e2230", "#142b3b", "#68d3e6", "#1b4552"],
  },
  {
    id: "ember",
    label: "Ember",
    description: "Kiln-warm charcoal with roasted orange.",
    mode: "dark",
    swatches: ["#1d1714", "#261e1a", "#f08a3e", "#40281c"],
  },
];

export const DARK_THEME_IDS = THEMES.filter((t) => t.mode === "dark").map(
  (t) => t.id,
);

export function getTheme(id: string | undefined): ThemeDefinition {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
