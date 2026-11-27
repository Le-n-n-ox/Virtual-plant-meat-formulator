import { create } from "zustand";
import type { CandidateScene } from "@/types";

/** Selection shared by panels, the 3D scene and the 2D fallback. */
interface SelectionState {
  selectedIngredientId: string | null;
  selectedCandidateId: string | null;
  /** Scene variables of the selected candidate, from its own payload. */
  candidateScene: CandidateScene | null;
  /** Cutaway (interior layers) instead of the outer fibre pattern. */
  cutaway: boolean;
  /** At most two candidate ids for the compare view. */
  comparePair: string[];

  selectIngredient: (id: string | null) => void;
  /** Selects a candidate for the 3D preview, carrying its scene variables. */
  selectCandidate: (id: string | null, scene?: CandidateScene | null) => void;
  setCutaway: (value: boolean) => void;
  toggleCompare: (id: string) => void;
  clear: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedIngredientId: null,
  selectedCandidateId: null,
  candidateScene: null,
  cutaway: false,
  comparePair: [],

  selectIngredient: (id) => set({ selectedIngredientId: id }),
  selectCandidate: (id, scene = null) =>
    set({
      selectedCandidateId: id,
      // A different candidate carries different variables; reset the view.
      candidateScene: id ? scene : null,
      cutaway: false,
    }),
  setCutaway: (cutaway) => set({ cutaway }),
  toggleCompare: (id) =>
    set((s) => {
      if (s.comparePair.includes(id)) {
        return { comparePair: s.comparePair.filter((c) => c !== id) };
      }
      return { comparePair: [...s.comparePair, id].slice(-2) };
    }),
  clear: () =>
    set({
      selectedIngredientId: null,
      selectedCandidateId: null,
      candidateScene: null,
      cutaway: false,
      comparePair: [],
    }),
}));
