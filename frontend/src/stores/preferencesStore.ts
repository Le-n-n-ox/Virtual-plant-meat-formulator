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

interface PreferencesState {
  viewMode: ViewMode;
  motion: MotionPreference;
  setViewMode: (mode: ViewMode) => void;
  setMotion: (motion: MotionPreference) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      viewMode: "auto",
      motion: "system",
      setViewMode: (viewMode) => set({ viewMode }),
      setMotion: (motion) => set({ motion }),
    }),
    {
      name: "vpmf-preferences",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
);
