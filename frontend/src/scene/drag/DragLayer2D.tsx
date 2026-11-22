"use client";

import { useDragStore } from "@/stores/dragStore";
import { useEffect } from "react";
import {
  cancelDrag,
  handleDragPointerMove,
  settleDragDrop,
} from "./dragRuntime";
import { inRect } from "./dragMath";

/**
 * The 2D mirror of `DragLayer` (guide §12.12). Same thresholds, same store, same
 * drop targets; there is no world plane, so the pointer position is enough.
 */
export function DragLayer2D() {
  const phase = useDragStore((s) => s.phase);

  useEffect(() => {
    if (phase !== "grab" && phase !== "carry" && phase !== "over-target") {
      return;
    }
    const onMove = (event: PointerEvent) => {
      const state = useDragStore.getState();
      if (state.pointerId !== null && state.pointerId !== event.pointerId)
        return;
      handleDragPointerMove(event);
      const rect = document.getElementById("scene-2d")?.getBoundingClientRect();
      if (rect) {
        useDragStore
          .getState()
          .setInCanvas(inRect({ x: event.clientX, y: event.clientY }, rect));
      }
    };
    const onUp = (event: PointerEvent) => {
      const state = useDragStore.getState();
      if (state.pointerId !== null && state.pointerId !== event.pointerId)
        return;
      void settleDragDrop();
    };
    const onCancel = () => cancelDrag();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const state = useDragStore.getState();
      if (!state.active) return;
      event.preventDefault();
      onCancel();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [phase]);

  return null;
}
