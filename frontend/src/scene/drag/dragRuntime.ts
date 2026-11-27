import type { PointerEvent as ReactPointerEvent } from "react";
import { useDragStore } from "@/stores/dragStore";
import { useFormulationStore } from "@/stores/formulationStore";
import { CARRY_TOP, rectTarget, shouldStartDrag, type Vec2 } from "./dragMath";
import { applyDrop } from "./actions";
import { dropSocket } from "./dropTargets";
import { releaseDuration } from "./releaseAnimation";
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
 * Ends a drag: records the release so the scene can animate it (guide §12.5),
 * then clears the drag once that animation has had its time. The reset is
 * guarded by the sequence number, so a user who starts a new drag during the
 * animation is never interrupted by the previous one's cleanup.
 */
function endDrag(outcome: "drop" | "cancel" | "reject", reason?: string) {
  const state = useDragStore.getState();
  const seq = state.seq;

  // A press that never passed the grab threshold is a click, not a cancelled
  // drag: clear it silently so click-to-place does not announce a cancel.
  if (!state.active) {
    state.reset();
    return;
  }
  const released = state.world
    ? { x: state.world.x, y: CARRY_TOP, z: state.world.z }
    : null;

  // Where the object settles: the target's socket on a drop, else home.
  const socket =
    outcome === "drop" && state.target
      ? dropSocket(state.target, state.kind, state.world ?? undefined)
      : null;
  const home = state.originWorld ?? released;
  const destination = socket
    ? { x: socket[0], y: socket[1], z: socket[2] }
    : home;

  state.finish(outcome, state.label, reason);

  if (released && destination) {
    state.setRelease({
      outcome,
      from: released,
      to: destination,
      kind: state.kind,
      id: state.id,
      startedAt: now(),
    });
    window.setTimeout(
      () => useDragStore.getState().resetIfSeq(seq),
      releaseDuration(outcome),
    );
    return;
  }
  // Nothing to animate (the drag never entered the canvas): clear at once.
  state.reset();
}

/** Monotonic clock, with a fallback for environments without `performance`. */
function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/**
 * Releases a carried object. A drop over a target edits the draft; anything
 * else cancels and changes nothing.
 */
export async function settleDragDrop() {
  const state = useDragStore.getState();
  const target = state.target;
  if (!target) {
    endDrag("cancel");
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
    endDrag("reject", result.reason);
  } else if (result.outcome === "none") {
    endDrag("cancel");
  } else {
    endDrag("drop");
  }
}

/** Escape cancels a carry and leaves the draft untouched. */
export function cancelDrag() {
  endDrag("cancel");
}
