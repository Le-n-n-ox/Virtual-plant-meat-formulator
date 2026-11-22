import type { PointerEvent as ReactPointerEvent } from "react";
import { useDragStore } from "@/stores/dragStore";
import { useFormulationStore } from "@/stores/formulationStore";
import { rectTarget, shouldStartDrag, type Vec2 } from "./dragMath";
import { applyDrop } from "./actions";
import { readDomTargets } from "./targets";

/**
 * Pointer-drag plumbing shared by the 3D canvas and the 2D schematic, so a drag
 * that starts in either view behaves identically. The 3D layer adds the world
 * position on top of this.
 */

/** The drop target under a client-pointer position (DOM targets only). */
export function resolveDomTarget(pointer: Vec2) {
  return rectTarget(pointer, readDomTargets());
}

/** Applies the grab threshold, then records the pointer and the target. */
export function handleDragPointerMove(event: {
  pointerId: number;
  pointerType: string;
  clientX: number;
  clientY: number;
}) {
  const state = useDragStore.getState();
  if (
    state.phase !== "grab" &&
    state.phase !== "carry" &&
    state.phase !== "over-target"
  ) {
    return;
  }
  if (state.phase === "grab") {
    const shouldGrab = shouldStartDrag({
      pointerType: event.pointerType,
      heldMs: Date.now() - state.grabbedAt,
      from: state.origin,
      to: { x: event.clientX, y: event.clientY },
    });
    if (!shouldGrab) return;
    state.grab(state.label);
  }
  const pointer = { x: event.clientX, y: event.clientY };
  state.move(pointer);
  state.setTarget(resolveDomTarget(pointer), state.label);
}

/** Resolves the pointer-down thresholds from a React pointer event. */
export function handleDragPointerDown(event: ReactPointerEvent) {
  const state = useDragStore.getState();
  return shouldStartDrag({
    pointerType: event.pointerType,
    heldMs: Date.now() - state.grabbedAt,
    from: state.origin,
    to: { x: event.clientX, y: event.clientY },
  });
}

/**
 * Releases a carried object. A drop over a target edits the draft; anything
 * else cancels and changes nothing.
 */
export async function settleDragDrop() {
  const state = useDragStore.getState();
  const target = state.target;
  if (!target) {
    state.finish("cancel", state.label);
    state.reset();
    return;
  }
  const catalog = useFormulationStore.getState().catalog;
  const result = await applyDrop({
    kind: state.kind,
    id: state.id,
    target,
    label: state.label,
    catalog,
  });
  if (result.outcome === "rejected") {
    state.finish("reject", state.label, result.reason);
  } else if (result.outcome === "none") {
    state.finish("cancel", state.label);
  } else {
    state.finish("drop", state.label);
  }
  state.reset();
}

/** Escape cancels a carry and leaves the draft untouched. */
export function cancelDrag() {
  const state = useDragStore.getState();
  state.finish("cancel", state.label);
  state.reset();
}
