"use client";

import { useCallback, useRef } from "react";
import { useFormulationStore } from "@/stores/formulationStore";
import { nextPercent, stepPercent } from "./percentDrag";

/**
 * Dragging the fill handle on a bin changes its percentage in 0.5 steps, or 0.1
 * while Shift is held (guide §12.3 row 4). The pointer is captured on the handle
 * so the drag continues if the pointer leaves the bin.
 */
export function usePercentDrag(
  ingredientId: string,
  getPercent: () => number,
): (event: {
  clientY: number;
  pointerId: number;
  target: EventTarget | null;
  stopPropagation: () => void;
}) => void {
  const setPercent = useFormulationStore((s) => s.setPercent);
  const carried = useRef(0);

  return useCallback(
    (event) => {
      event.stopPropagation();
      const element = event.target as Element | null;
      const pointerId = event.pointerId;
      let lastY = event.clientY;
      carried.current = 0;

      try {
        element?.setPointerCapture?.(pointerId);
      } catch {
        /* the pointer may already be released */
      }

      const onMove = (move: PointerEvent) => {
        if (move.pointerId !== pointerId) return;
        const result = nextPercent(
          getPercent(),
          move.clientY - lastY,
          move.shiftKey,
          carried.current,
        );
        lastY = move.clientY;
        carried.current = result.carriedPx;
        if (result.percent !== getPercent()) {
          setPercent(ingredientId, result.percent);
        }
      };
      const onUp = (up: PointerEvent) => {
        if (up.pointerId !== pointerId) return;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        carried.current = 0;
        try {
          element?.releasePointerCapture?.(pointerId);
        } catch {
          /* already released */
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [getPercent, ingredientId, setPercent],
  );
}

/** The plus/minus buttons and the arrow keys share one stepper. */
export function usePercentStep(
  ingredientId: string,
  getPercent: () => number,
): (direction: 1 | -1, fine: boolean) => void {
  const setPercent = useFormulationStore((s) => s.setPercent);
  return useCallback(
    (direction, fine) => {
      setPercent(ingredientId, stepPercent(getPercent(), direction, fine));
    },
    [getPercent, ingredientId, setPercent],
  );
}
