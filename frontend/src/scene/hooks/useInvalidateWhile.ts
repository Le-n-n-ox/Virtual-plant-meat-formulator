"use client";

import { useFrame } from "@react-three/fiber";
import { useThree } from "@react-three/fiber";

/**
 * Keeps the canvas rendering while something is still moving.
 *
 * The scene runs on `frameloop="demand"` when nothing is happening, so the only
 * thing that may ask for frames is the animation itself. Any component that
 * animates calls this with `true` while it is not settled, and the frame loop
 * stops the moment everything comes to rest.
 */
export function useInvalidateWhile(active: boolean) {
  const invalidate = useThree((s) => s.invalidate);
  useFrame(() => {
    if (active) invalidate();
  });
}
