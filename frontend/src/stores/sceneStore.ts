import { create } from "zustand";
import type { IngredientListItem } from "@/types";

/**
 * Purely visual scene requests (camera, pantry contents). Contains no
 * scientific state, so the scene stays reproducible from formulation +
 * job/result stores alone.
 */
interface SceneState {
  /** Incremented to ask the camera to return to its home view. */
  cameraResetToken: number;
  requestCameraReset: () => void;
  /**
   * Crops the pantry offers: the ingredient picker's current search results,
   * mirrored into the scene (guide §12.2). Held here so the HTML pantry panel
   * and the 3D shelf show the same crops from one request, and so the scene
   * reads it from a store rather than from props threaded through the canvas.
   */
  pantryItems: IngredientListItem[];
  setPantryItems: (items: IngredientListItem[]) => void;
}

export const useSceneStore = create<SceneState>((set) => ({
  cameraResetToken: 0,
  requestCameraReset: () =>
    set((s) => ({ cameraResetToken: s.cameraResetToken + 1 })),
  pantryItems: [],
  setPantryItems: (items) => set({ pantryItems: items }),
}));
