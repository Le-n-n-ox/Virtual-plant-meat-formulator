import { create } from "zustand";
import type { DragKind } from "@/stores/dragStore";

/**
 * The click-to-place and keyboard equivalent of a drag (guide §12.3, WCAG 2.5.7
 * Dragging Movements). `dragStore` is the pointer path; this is the held item
 * for "click the crop, then click the vessel", and for Space-pick / Space-place.
 */
export interface HeldItem {
  kind: DragKind;
  id: string;
  label: string;
}

interface PlacementState {
  held: HeldItem | null;
  hold: (item: HeldItem) => void;
  replace: (item: HeldItem) => void;
  release: () => void;
}

export const usePlacementStore = create<PlacementState>((set) => ({
  held: null,
  hold: (item) => set({ held: item }),
  replace: (item) => set({ held: item }),
  release: () => set({ held: null }),
}));
