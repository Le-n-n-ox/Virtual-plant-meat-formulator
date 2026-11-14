import { create } from "zustand";

/**
 * Purely visual scene requests (camera). Contains no scientific state, so the
 * scene stays reproducible from formulation + job/result stores alone.
 */
interface SceneState {
  /** Incremented to ask the camera to return to its home view. */
  cameraResetToken: number;
  requestCameraReset: () => void;
}

export const useSceneStore = create<SceneState>((set) => ({
  cameraResetToken: 0,
  requestCameraReset: () =>
    set((s) => ({ cameraResetToken: s.cameraResetToken + 1 })),
}));
