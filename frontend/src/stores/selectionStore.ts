import { create } from "zustand";

/** Selection shared by panels, the 3D scene and the 2D fallback. */
interface SelectionState {
  selectedIngredientId: string | null;
  selectedCandidateId: string | null;
  /** At most two candidate ids for the compare view. */
  comparePair: string[];

  selectIngredient: (id: string | null) => void;
  selectCandidate: (id: string | null) => void;
  toggleCompare: (id: string) => void;
  clear: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedIngredientId: null,
  selectedCandidateId: null,
  comparePair: [],

  selectIngredient: (id) => set({ selectedIngredientId: id }),
  selectCandidate: (id) => set({ selectedCandidateId: id }),
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
      comparePair: [],
    }),
}));
