import { create } from "zustand";
import type { NutritionResult, TextureResult } from "@/types";

/**
 * Results of the most recent job for the open formulation. Everything here
 * comes from the backend; nothing is derived or estimated in the browser.
 */
export interface RunError {
  code: string;
  message: string;
  jobType?: string;
}

interface ResultState {
  nutrition: NutritionResult | null;
  texture: (TextureResult & { evidence_basis?: string }) | null;
  /** Formulation version the shown results were calculated for. */
  version: number | null;
  loading: boolean;
  error: RunError | null;
  setLoading: (loading: boolean) => void;
  setNutrition: (result: NutritionResult, version: number) => void;
  setTexture: (
    result: TextureResult & { evidence_basis?: string },
    version: number,
  ) => void;
  setError: (error: RunError | null) => void;
  clear: () => void;
}

const initial = {
  nutrition: null,
  texture: null,
  version: null,
  loading: false,
  error: null,
};

export const useResultStore = create<ResultState>((set) => ({
  ...initial,
  setLoading: (loading) => set({ loading }),
  setNutrition: (nutrition, version) =>
    set({ nutrition, version, loading: false, error: null }),
  setTexture: (texture, version) =>
    set({ texture, version, loading: false, error: null }),
  setError: (error) => set({ error, loading: false }),
  clear: () => set(initial),
}));
