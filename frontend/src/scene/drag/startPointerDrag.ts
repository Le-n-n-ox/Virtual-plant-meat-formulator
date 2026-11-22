"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import {
  useDragStore,
  type DragKind,
  type DragSource,
} from "@/stores/dragStore";

/**
 * Starts a pointer drag from an HTML element (guide §12.3). Pointer Events are
 * used rather than the HTML5 drag-and-drop API: HTML5 drag never fires on touch
 * and cannot show a 3D object under the pointer.
 *
 * Returns a `pointerdown` handler. The `DragLayer` takes over from there.
 */
export function startPointerDrag(options: {
  kind: DragKind;
  id: string;
  label: string;
  source: DragSource;
  disabled?: boolean;
}) {
  return (event: ReactPointerEvent) => {
    if (options.disabled) return;
    // A right-click or a non-primary button is never a drag.
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    useDragStore.getState().begin({
      kind: options.kind,
      id: options.id,
      source: options.source,
      origin: { x: event.clientX, y: event.clientY },
      pointerId: event.pointerId,
      label: options.label,
    });
  };
}
