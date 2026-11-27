import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Local UI preferences (persisted in localStorage).
 * Theme is handled separately by next-themes.
 *
 * Uses `skipHydration`; <PreferencesHydrator /> rehydrates after mount so the
 * server render and first client render match.
 */
export type ViewMode = "auto" | "3d" | "2d";
export type MotionPreference = "system" | "reduce" | "full";
export type AminoAcidUnit = "mg" | "g";
export type EnergyUnit = "kcal" | "kJ";
export type ProteinUnit = "g_per_100g" | "percent";

interface PreferencesState {
  viewMode: ViewMode;
  motion: MotionPreference;
  /** Display units only; the backend always stores canonical units. */
  aminoAcidUnit: AminoAcidUnit;
  energyUnit: EnergyUnit;
  proteinUnit: ProteinUnit;
  /**
   * Set when the live performance monitor gives up on 3D and the scene has
   * switched to the 2D view. Shown as a visible explanation, never silent.
   */
  performanceNotice: string | null;
  setViewMode: (mode: ViewMode) => void;
  setMotion: (motion: MotionPreference) => void;
  setAminoAcidUnit: (unit: AminoAcidUnit) => void;
  setEnergyUnit: (unit: EnergyUnit) => void;
  setProteinUnit: (unit: ProteinUnit) => void;
  setPerformanceNotice: (notice: string | null) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      viewMode: "auto",
      motion: "system",
      aminoAcidUnit: "mg",
      energyUnit: "kcal",
      proteinUnit: "g_per_100g",
      performanceNotice: null,
      setViewMode: (viewMode) => set({ viewMode }),
      setMotion: (motion) => set({ motion }),
      setAminoAcidUnit: (aminoAcidUnit) => set({ aminoAcidUnit }),
      setEnergyUnit: (energyUnit) => set({ energyUnit }),
      setProteinUnit: (proteinUnit) => set({ proteinUnit }),
      setPerformanceNotice: (performanceNotice) => set({ performanceNotice }),
    }),
    {
      name: "vpmf-preferences",
      // Stays at 1 when a preference is added: the persisted object is merged
      // over the defaults above, so state written before the new field existed
      // still loads and the field simply keeps its default. Bumping the version
      // without a `migrate` would throw that older state away instead.
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      // The performance notice is a per-session fallback, not a preference.
      partialize: (s) => ({
        viewMode: s.viewMode,
        motion: s.motion,
        aminoAcidUnit: s.aminoAcidUnit,
        energyUnit: s.energyUnit,
        proteinUnit: s.proteinUnit,
      }),
    },
  ),
);
